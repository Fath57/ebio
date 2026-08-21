import type {
  CheckStatusResult,
  InitiatePaymentParams,
  InitiatePaymentResult,
  PaymentGatewayInterface,
  RefundResult,
  WebhookResult,
} from './payment-gateway.interface'
import { Logger } from '@nestjs/common'
import { FedaPay, Payout, Transaction } from 'fedapay'
import { config } from '../../../config/env.config'

const FEDAPAY_STATUS_MAP: Record<string, string> = {
  approved: 'completed',
  transferred: 'completed',
  declined: 'failed',
  canceled: 'failed',
  refunded: 'refunded',
  pending: 'pending',
}

export class FedaPayGateway implements PaymentGatewayInterface {
  private readonly logger = new Logger(FedaPayGateway.name)

  constructor() {
    FedaPay.setApiKey(config.payments.fedapay.apiKey ?? '')
    FedaPay.setEnvironment(
      (config.payments.fedapay.environment as 'sandbox' | 'live') ?? 'sandbox',
    )
  }

  async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    // An empty phone_number makes FedaPay reject the transaction: the
    // customer block is only sent when a phone actually exists (Google
    // sign-ups have none), and FedaPay collects it on its payment page.
    const transaction = await Transaction.create({
      description: `Order payment ${params.orderId}`,
      amount: params.amount,
      currency: { iso: params.currency },
      callback_url: params.callbackUrl,
      ...(params.phoneNumber
        ? { customer: { phone_number: { number: params.phoneNumber, country: 'BJ' } } }
        : {}),
    })

    const token = await (transaction as unknown as { generateToken: () => Promise<{ url: string }> }).generateToken()

    return {
      redirectUrl: token.url,
      providerTransactionId: String(transaction.id),
      status: 'pending',
    }
  }

  async checkStatus(providerTransactionId: string): Promise<CheckStatusResult> {
    const transaction = await Transaction.retrieve(Number(providerTransactionId))
    const txn = transaction as unknown as { status?: string, approved_at?: string, reference?: string, payment_method_id?: number }
    const mappedStatus = FEDAPAY_STATUS_MAP[txn.status ?? 'pending'] ?? 'pending'

    return {
      status: mappedStatus,
      paidAt: mappedStatus === 'completed'
        ? (txn.approved_at ? new Date(txn.approved_at) : new Date())
        : undefined,
      reference: txn.reference ?? undefined,
      providerPaymentMethodId: txn.payment_method_id ? String(txn.payment_method_id) : undefined,
    }
  }

  async processRefund(providerTransactionId: string, _amount: number): Promise<RefundResult> {
    try {
      const transaction = await Transaction.retrieve(Number(providerTransactionId))
      await (transaction as unknown as { refund: () => Promise<void> }).refund()
      return { success: true }
    }
    catch (error) {
      this.logger.error(`FedaPay refund failed for ${providerTransactionId}`, error)
      return { success: false }
    }
  }

  async handleWebhook(payload: unknown, _signature?: string): Promise<WebhookResult> {
    const event = payload as { entity: { id: number, status: string } }

    const transactionId = String(event.entity.id)
    const rawStatus = event.entity.status
    const mappedStatus = FEDAPAY_STATUS_MAP[rawStatus] ?? 'pending'

    return {
      providerTransactionId: transactionId,
      status: mappedStatus,
      paidAt: mappedStatus === 'completed' ? new Date() : undefined,
    }
  }

  /**
   * Two-step payout, as in FedaPay's own flow: create, then send. Returns the
   * provider ids; the caller tracks completion via webhook + polling since
   * the money leaves asynchronously (pending → started → sent | failed).
   */
  async createPayout(params: {
    amount: number
    phoneNumber: string
    /** FedaPay mode: mtn_open | moov | sbin, derived from the number's prefix. */
    mode: string
    firstname: string
    lastname: string
    email?: string
    withdrawalId: string
  }): Promise<{ payoutId: string, reference: string | null }> {
    const payout = await Payout.create({
      amount: params.amount,
      currency: { iso: 'XOF' },
      mode: params.mode,
      customer: {
        firstname: params.firstname,
        lastname: params.lastname,
        // FedaPay requires an email; fall back to a technical one.
        email: params.email ?? `${params.phoneNumber}@email.com`,
        phone_number: {
          number: `229${params.phoneNumber}`,
          country: 'bj',
        },
      },
      custom_metadata: { withdrawal_id: params.withdrawalId },
    })

    await payout.sendNow()

    return {
      payoutId: String(payout.id),
      reference: (payout as unknown as { reference?: string }).reference ?? null,
    }
  }

  async checkPayoutStatus(payoutId: string): Promise<{
    status: 'pending' | 'sent' | 'failed'
    reference: string | null
    errorMessage: string | null
  }> {
    const payout = await Payout.retrieve(Number(payoutId))
    const raw = payout as unknown as {
      status?: string
      reference?: string
      last_error_message?: string
    }
    const status = raw.status === 'sent'
      ? 'sent' as const
      : raw.status === 'failed' ? 'failed' as const : 'pending' as const

    return {
      status,
      reference: raw.reference ?? null,
      errorMessage: raw.last_error_message ?? null,
    }
  }
}
