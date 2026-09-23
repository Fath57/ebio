import type {
  CheckStatusResult,
  CreatePayoutParams,
  InitiatePaymentParams,
  InitiatePaymentResult,
  PaymentGatewayInterface,
  PayoutGatewayInterface,
  PayoutStatusResult,
  RefundResult,
  WebhookResult,
} from './payment-gateway.interface'
import { Logger } from '@nestjs/common'
import { config } from '../../../config/env.config'
import { IntramClient, verifyWebhookSignature } from './intram-client'

/**
 * Two vocabularies for one thing: `GET /transactions` answers in upper case,
 * the webhook payloads in lower. Both are mapped here so nothing downstream
 * has to know which surface a status came from.
 */
const INTRAM_STATUS_MAP: Record<string, string> = {
  SUCCESS: 'completed',
  completed: 'completed',
  paid: 'completed',
  PENDING: 'pending',
  pending: 'pending',
  queued: 'pending',
  ERROR: 'failed',
  failed: 'failed',
  REFUNDED: 'refunded',
  refunded: 'refunded',
}

/** Event → status, for the four payment events INTRAM emits. */
const WEBHOOK_EVENT_STATUS: Record<string, string> = {
  'payment_request.created': 'pending',
  'payment_request.pending': 'pending',
  'payment_request.paid': 'completed',
  'payment_request.failed': 'failed',
  'refund.completed': 'refunded',
  'refund.pending': 'pending',
  'refund.failed': 'failed',
}

/** How long we wait for the hosted checkout URL before handing back. */
const GATEWAY_URL_TIMEOUT_MS = 10_000
const GATEWAY_URL_POLL_MS = 700

interface IntramOperation {
  operation_id: string
  type: string
  status: string
  result?: {
    transaction_reference?: string
    gateway_url?: string
    payment_url?: string
    status?: string
  }
}

interface IntramTransaction {
  reference: string
  status: string
  amount: number
  fees?: number
  net_amount?: number
  currency: string
  payment_method?: string
  date?: string
}

/**
 * INTRAM Merchant API v1.
 *
 * It differs from FedaPay on the one point that shapes everything else:
 * creating a payment is **asynchronous**. The POST answers `202` with an
 * operation id, a worker then creates the transaction, and only afterwards
 * does the hosted checkout URL exist. Since the rest of eBio expects a
 * redirect URL in hand, this gateway waits for it — briefly, and without
 * failing the payment if it is not ready: the webhook carries it too.
 *
 * Fees are added on top of the amount by INTRAM and paid by the customer, so
 * the amount sent here stays the order total, untouched.
 */
/**
 * Our operator codes are FedaPay's, because they were there first and they
 * sit in `payout_numbers.operator` on every saved number. Translating at the
 * edge keeps that column untouched by a change of provider.
 */
const INTRAM_PROVIDER_CODES: Record<string, string> = {
  mtn_open: 'MTN_BENIN_229',
  moov: 'MOOV_AFRICA_BENIN_229',
  sbin: 'SBIN_BENIN_229',
}

export class IntramGateway implements PaymentGatewayInterface, PayoutGatewayInterface {
  private readonly logger = new Logger(IntramGateway.name)

  constructor(private readonly client: IntramClient = new IntramClient()) {}

  async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    const operation = await this.client.post<IntramOperation>(
      '/payment-requests',
      {
        invoice: {
          amount: params.amount,
          currency: params.currency,
          description: `Commande ${params.orderId}`,
          customer: params.phoneNumber ? { phone: params.phoneNumber } : {},
        },
        // A hint only: the hosted page still lets the buyer pick another one.
        ...(params.paymentMethod
          ? { payment_method: { code: params.paymentMethod, country_code: 'BJ', ...(params.phoneNumber ? { msisdn: params.phoneNumber } : {}) } }
          : {}),
        return_urls: { success: params.callbackUrl, cancel: params.callbackUrl },
        webhook_data: { order_id: params.orderId },
      },
      // Keyed on the order: a retried checkout reuses the same request
      // instead of opening a second one against the same basket.
      `pr-order-${params.orderId}`,
    )

    const ready = await this.waitForGatewayUrl(operation.operation_id)

    return {
      redirectUrl: ready?.gateway_url ?? ready?.payment_url,
      // The transaction reference is what every later call needs; until the
      // worker has minted it, the operation id is the only handle we have and
      // the webhook carries it too.
      providerTransactionId: ready?.transaction_reference ?? operation.operation_id,
      status: 'pending',
    }
  }

  /**
   * Polls the operation until the checkout URL appears.
   *
   * Returning empty-handed is not a failure: `payment_request.created` brings
   * the same URL, so the payment is merely slower to open, never lost.
   */
  private async waitForGatewayUrl(operationId: string): Promise<IntramOperation['result'] | null> {
    const deadline = Date.now() + GATEWAY_URL_TIMEOUT_MS

    while (Date.now() < deadline) {
      try {
        const operation = await this.client.get<IntramOperation>(`/operations/${operationId}`)
        if (operation.result?.gateway_url || operation.result?.payment_url) {
          return operation.result
        }
        if (operation.status === 'failed') {
          this.logger.error(`INTRAM operation ${operationId} échouée avant ouverture du paiement`)
          return null
        }
      }
      catch (error) {
        this.logger.warn(`INTRAM: lecture de l'opération ${operationId} impossible — ${error}`)
      }
      await new Promise(resolve => setTimeout(resolve, GATEWAY_URL_POLL_MS))
    }

    this.logger.warn(`INTRAM: URL de paiement non disponible après ${GATEWAY_URL_TIMEOUT_MS} ms (opération ${operationId})`)
    return null
  }

  async checkStatus(providerTransactionId: string): Promise<CheckStatusResult> {
    const transaction = await this.client.get<IntramTransaction>(`/transactions/${providerTransactionId}`)
    const status = INTRAM_STATUS_MAP[transaction.status] ?? 'pending'

    return {
      status,
      paidAt: status === 'completed' ? (transaction.date ? new Date(transaction.date) : new Date()) : undefined,
      reference: transaction.reference,
      providerPaymentMethodId: transaction.payment_method,
      // What INTRAM actually took, fees excluded — the figure to reconcile on.
      amount: typeof transaction.amount === 'number' ? transaction.amount : undefined,
    }
  }

  async processRefund(providerTransactionId: string, amount: number): Promise<RefundResult> {
    try {
      await this.client.post(
        '/refunds',
        { transaction_reference: providerTransactionId, amount },
        `rf-${providerTransactionId}`,
      )
      // Accepted, not done: `refund.completed` closes it. Saying otherwise
      // here would have the caller announce a refund that may still fail.
      return { success: true }
    }
    catch (error) {
      this.logger.error(`INTRAM: remboursement refusé pour ${providerTransactionId}`, error)
      return { success: false }
    }
  }

  /**
   * Reads a webhook that has already been proven authentic by the controller.
   *
   * It is deliberately strict about that: `verifyWebhook` is a separate step,
   * so a caller cannot accidentally trust an unsigned body by calling this.
   */
  async handleWebhook(payload: unknown, _signature?: string): Promise<WebhookResult> {
    const event = payload as {
      event?: string
      operation_id?: string
      data?: { reference?: string, transaction_reference?: string, status?: string }
    }

    const reference = event.data?.transaction_reference
      ?? event.data?.reference
      ?? event.operation_id
      ?? ''

    const status = WEBHOOK_EVENT_STATUS[event.event ?? '']
      ?? INTRAM_STATUS_MAP[event.data?.status ?? '']
      ?? 'pending'

    return {
      providerTransactionId: reference,
      status,
      paidAt: status === 'completed' ? new Date() : undefined,
    }
  }

  /**
   * Proves a webhook came from INTRAM. Kept on the gateway so the controller
   * has one thing to call, whichever provider the route belongs to.
   */
  verifyWebhook(rawBody: string, signature?: string, timestamp?: string): boolean {
    const secret = config.payments.intram.webhookSecret
    if (!secret) {
      this.logger.error('INTRAM_WEBHOOK_SECRET absent : webhook refusé')
      return false
    }
    return verifyWebhookSignature({ rawBody, signature, timestamp, secret })
  }

  /**
   * Sends money out — a courier's earnings, a shop's withdrawal.
   *
   * Asynchronous like everything else here: the `202` only says the order was
   * taken. `payout.completed` or `payout.failed` says what became of it, and
   * `checkPayoutStatus` is the fallback when no webhook arrives.
   */
  async createPayout(params: CreatePayoutParams): Promise<{ payoutId: string, reference: string | null }> {
    const providerCode = INTRAM_PROVIDER_CODES[params.mode]
    if (!providerCode) {
      // Refusing here beats sending an operator code INTRAM will reject: the
      // withdrawal fails before the money is reserved, not after.
      throw new Error(`INTRAM: opérateur inconnu « ${params.mode} »`)
    }

    const operation = await this.client.post<IntramOperation>(
      '/payouts',
      {
        amount: params.amount,
        currency: 'XOF',
        destination: {
          type: 'mobile_money',
          country_code: 'BJ',
          provider_code: providerCode,
          // International format without the plus sign, as INTRAM expects.
          msisdn: params.phoneNumber.startsWith('229') ? params.phoneNumber : `229${params.phoneNumber}`,
          account_name: params.firstname,
          account_surname: params.lastname,
        },
        reference: params.withdrawalId,
        metadata: { withdrawal_id: params.withdrawalId },
      },
      // The withdrawal's own id: a retry can never pay twice.
      `po-${params.withdrawalId}`,
    )

    return {
      payoutId: operation.operation_id,
      reference: operation.result?.transaction_reference ?? null,
    }
  }

  async checkPayoutStatus(payoutId: string): Promise<PayoutStatusResult> {
    const operation = await this.client.get<IntramOperation & { error_message?: string }>(`/operations/${payoutId}`)
    const raw = operation.result?.status ?? operation.status

    const status = raw === 'completed'
      ? 'sent' as const
      : raw === 'failed' ? 'failed' as const : 'pending' as const

    return {
      status,
      reference: operation.result?.transaction_reference ?? null,
      errorMessage: operation.error_message ?? null,
    }
  }
}
