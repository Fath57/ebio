import type {
  CheckStatusResult,
  InitiatePaymentParams,
  InitiatePaymentResult,
  PaymentGatewayInterface,
  RefundResult,
  WebhookResult,
} from './payment-gateway.interface'
import { Logger } from '@nestjs/common'
import { config } from '../../../config/env.config'

interface PawerPayerResponse {
  status: string
  data: {
    transaction_id: string
    redirect_url?: string
    status: string
    paid_at?: string
  }
}

const PAWERPAYER_STATUS_MAP: Record<string, string> = {
  success: 'completed',
  successful: 'completed',
  pending: 'pending',
  failed: 'failed',
  cancelled: 'failed',
  refunded: 'refunded',
}

export class PawerPayerGateway implements PaymentGatewayInterface {
  private readonly logger = new Logger(PawerPayerGateway.name)
  private readonly apiUrl: string
  private readonly apiKey: string

  constructor() {
    this.apiUrl = config.payments.pawerpayer.apiUrl ?? ''
    this.apiKey = config.payments.pawerpayer.apiKey ?? ''
  }

  async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    const response = await fetch(`${this.apiUrl}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        amount: params.amount,
        currency: params.currency,
        payment_method: params.paymentMethod,
        phone_number: params.phoneNumber,
        callback_url: params.callbackUrl,
        metadata: {
          order_id: params.orderId,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`PawerPayer initiate payment failed: ${response.status} ${errorText}`)
    }

    const result = await response.json() as PawerPayerResponse

    return {
      redirectUrl: result.data.redirect_url,
      providerTransactionId: result.data.transaction_id,
      status: 'pending',
    }
  }

  async checkStatus(providerTransactionId: string): Promise<CheckStatusResult> {
    const response = await fetch(`${this.apiUrl}/transactions/${providerTransactionId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    })

    if (!response.ok) {
      throw new Error(`PawerPayer check status failed: ${response.status}`)
    }

    const result = await response.json() as PawerPayerResponse
    const mappedStatus = PAWERPAYER_STATUS_MAP[result.data.status] ?? 'pending'

    return {
      status: mappedStatus,
      paidAt: result.data.paid_at ? new Date(result.data.paid_at) : undefined,
    }
  }

  async processRefund(providerTransactionId: string, amount: number): Promise<RefundResult> {
    try {
      const response = await fetch(`${this.apiUrl}/transactions/${providerTransactionId}/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ amount }),
      })

      if (!response.ok) {
        this.logger.error(`PawerPayer refund failed for ${providerTransactionId}: ${response.status}`)
        return { success: false }
      }

      return { success: true }
    }
    catch (error) {
      this.logger.error(`PawerPayer refund failed for ${providerTransactionId}`, error)
      return { success: false }
    }
  }

  async handleWebhook(payload: unknown, _signature?: string): Promise<WebhookResult> {
    const event = payload as {
      transaction_id: string
      status: string
      paid_at?: string
    }

    const mappedStatus = PAWERPAYER_STATUS_MAP[event.status] ?? 'pending'

    return {
      providerTransactionId: event.transaction_id,
      status: mappedStatus,
      paidAt: event.paid_at ? new Date(event.paid_at) : undefined,
    }
  }
}
