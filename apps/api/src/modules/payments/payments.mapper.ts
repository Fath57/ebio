import type { PaymentResponse } from './contracts/payment.contract'
import { Payment } from './payment.entity'

export class PaymentMapper {
  static toResponse(payment: Payment): PaymentResponse {
    return {
      id: payment.id,
      orderId: payment.order.id,
      amount: payment.amount,
      currency: 'XOF',
      provider: payment.provider as PaymentResponse['provider'],
      paymentMethod: payment.paymentMethod,
      operator: payment.operator ?? null,
      providerTransactionId: payment.providerTransactionId ?? null,
      status: payment.status,
      phoneNumber: payment.phoneNumber ?? null,
      paidAt: payment.paidAt?.toISOString() ?? null,
      releasedAt: payment.releasedAt?.toISOString() ?? null,
      refundedAt: payment.refundedAt?.toISOString() ?? null,
      receiptUrl: payment.receiptUrl ?? null,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
    }
  }
}
