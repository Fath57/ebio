import type {
  CheckStatusResult,
  InitiatePaymentParams,
  InitiatePaymentResult,
  PaymentGatewayInterface,
  RefundResult,
  WebhookResult,
} from './payment-gateway.interface'
import { Logger } from '@nestjs/common'
import { FedaPay, Transaction } from 'fedapay'
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
    const transaction = await Transaction.create({
      description: `Order payment ${params.orderId}`,
      amount: params.amount,
      currency: { iso: params.currency },
      callback_url: params.callbackUrl,
      customer: {
        phone_number: {
          number: params.phoneNumber ?? '',
          country: 'BJ',
        },
      },
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
}
