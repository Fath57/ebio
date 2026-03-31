import type {
  CheckStatusResult,
  InitiatePaymentParams,
  InitiatePaymentResult,
  PaymentGatewayInterface,
  RefundResult,
  WebhookResult,
} from './payment-gateway.interface'
import { Buffer } from 'node:buffer'
import { Logger } from '@nestjs/common'
import Stripe from 'stripe'
import { config } from '../../../config/env.config'

const STRIPE_STATUS_MAP: Record<string, string> = {
  succeeded: 'completed',
  requires_payment_method: 'pending',
  requires_confirmation: 'pending',
  requires_action: 'pending',
  processing: 'pending',
  canceled: 'failed',
  requires_capture: 'pending',
}

export class StripeGateway implements PaymentGatewayInterface {
  private readonly logger = new Logger(StripeGateway.name)
  private readonly stripe: Stripe

  constructor() {
    this.stripe = new Stripe(config.payments.stripe.secretKey ?? '')
  }

  async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: Math.round(params.amount * 100),
      currency: params.currency.toLowerCase(),
      payment_method_types: [this.mapPaymentMethod(params.paymentMethod)],
      metadata: {
        orderId: params.orderId,
      },
    })

    return {
      clientSecret: paymentIntent.client_secret ?? undefined,
      providerTransactionId: paymentIntent.id,
      status: 'requires_action',
    }
  }

  async checkStatus(providerTransactionId: string): Promise<CheckStatusResult> {
    const paymentIntent = await this.stripe.paymentIntents.retrieve(providerTransactionId)
    const mappedStatus = STRIPE_STATUS_MAP[paymentIntent.status] ?? 'pending'

    return {
      status: mappedStatus,
      paidAt: mappedStatus === 'completed' ? new Date() : undefined,
    }
  }

  async processRefund(providerTransactionId: string, amount: number): Promise<RefundResult> {
    try {
      await this.stripe.refunds.create({
        payment_intent: providerTransactionId,
        amount: Math.round(amount * 100),
      })
      return { success: true }
    }
    catch (error) {
      this.logger.error(`Stripe refund failed for ${providerTransactionId}`, error)
      return { success: false }
    }
  }

  async handleWebhook(payload: unknown, signature?: string): Promise<WebhookResult> {
    const event = this.stripe.webhooks.constructEvent(
      payload as string | Buffer,
      signature ?? '',
      config.payments.stripe.webhookSecret ?? '',
    )

    if (event.type !== 'payment_intent.succeeded' && event.type !== 'payment_intent.payment_failed') {
      throw new Error(`Unhandled Stripe event type: ${event.type}`)
    }

    const paymentIntent = event.data.object as Stripe.PaymentIntent
    const mappedStatus = event.type === 'payment_intent.succeeded' ? 'completed' : 'failed'

    return {
      providerTransactionId: paymentIntent.id,
      status: mappedStatus,
      paidAt: mappedStatus === 'completed' ? new Date() : undefined,
    }
  }

  private mapPaymentMethod(code: string): string {
    const methodMap: Record<string, string> = {
      visa_card: 'card',
      mastercard: 'card',
    }
    return methodMap[code] ?? 'card'
  }
}
