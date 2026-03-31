import type { InitiateCheckoutInput, InitiatePayment, VerifyCheckoutInput } from './contracts/payment.contract'
import type { PaymentGatewayInterface } from './gateways/payment-gateway.interface'
import { EntityManager } from '@mikro-orm/postgresql'
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { config } from '../../config/env.config'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { Order, PaymentMethod as OrderPaymentMethod } from '../orders/entities/order.entity'
import { CommissionService } from './commission.service'
import { PaymentMethod } from './entities/payment-method.entity'
import { PaymentGatewayFactory } from './gateways/payment-gateway.factory'
import { MobileOperator, Payment, PaymentProvider, PaymentStatus } from './payment.entity'

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly notificationsService: NotificationsService,
    private readonly commissionService: CommissionService,
    private readonly gatewayFactory: PaymentGatewayFactory,
  ) {}

  /**
   * Returns payment info needed by the frontend to display the payment screen.
   */
  async getPaymentInfo(userId: string, orderId: string) {
    const order = await this.em.findOneOrFail(
      Order,
      { id: orderId },
      { populate: ['buyer'] },
    )

    if (order.buyer.id !== userId) {
      throw new BadRequestException('You can only view your own order payment info')
    }

    if (order.paymentMethod !== OrderPaymentMethod.FEDAPAY) {
      throw new BadRequestException('This order uses cash on delivery')
    }

    return {
      amount: order.totalAmount,
      currency: 'XOF',
      fedapayPublicKey: config.payments.fedapay.publicKey ?? null,
    }
  }

  /**
   * Initiates a no-redirect (USSD push) payment.
   * Backend creates the transaction via the gateway and sends the USSD push.
   * Frontend then polls getPaymentStatus() for completion.
   */
  async initiateNoRedirectPayment(userId: string, data: InitiatePayment) {
    const order = await this.em.findOneOrFail(
      Order,
      { id: data.orderId },
      { populate: ['buyer', 'supplier', 'supplier.user', 'items', 'items.product', 'items.product.category'] },
    )

    if (order.buyer.id !== userId) {
      throw new BadRequestException('You can only pay for your own orders')
    }

    if (order.paymentMethod !== OrderPaymentMethod.FEDAPAY) {
      throw new BadRequestException('This order uses cash on delivery')
    }

    const existingCompleted = await this.em.findOne(Payment, {
      order: { id: data.orderId },
      status: { $in: [PaymentStatus.CAPTURED, PaymentStatus.ESCROW, PaymentStatus.RELEASED] },
    })

    if (existingCompleted) {
      throw new BadRequestException('A payment already exists for this order')
    }

    // Cancel any stale pending payments so the user can retry
    const stalePending = await this.em.find(Payment, {
      order: { id: data.orderId },
      status: PaymentStatus.PENDING,
    })
    for (const stale of stalePending) {
      stale.status = PaymentStatus.FAILED
    }

    const paymentMethod = await this.em.findOneOrFail(
      PaymentMethod,
      { id: data.paymentMethodId },
    )

    if (paymentMethod.useFedapayCheckout) {
      throw new BadRequestException('This payment method uses Checkout.js, not no-redirect mode')
    }

    if (!data.phoneNumber) {
      throw new BadRequestException('Phone number is required for no-redirect payments')
    }

    const gateway = this.gatewayFactory.createGateway(paymentMethod.provider)
    const callbackUrl = `${config.clients.webApp.url}/payments/callback`

    const gatewayResult = await gateway.initiatePayment({
      amount: order.totalAmount,
      currency: 'XOF',
      orderId: data.orderId,
      paymentMethod: paymentMethod.code,
      phoneNumber: data.phoneNumber,
      callbackUrl,
    })

    const payment = this.em.create(Payment, {
      order,
      amount: order.totalAmount,
      provider: paymentMethod.provider,
      providerTransactionId: gatewayResult.providerTransactionId,
      paymentMethod: paymentMethod.code,
      phoneNumber: data.phoneNumber,
      status: PaymentStatus.PENDING,
    })

    await this.em.flush()

    return {
      paymentId: payment.id,
      status: 'pending' as const,
    }
  }

  /**
   * Creates a pending Payment before opening Checkout.js.
   * Returns the paymentId so the frontend can pass it in FedaPay metadata.
   */
  async initiateCheckoutPayment(userId: string, data: InitiateCheckoutInput) {
    const order = await this.em.findOneOrFail(
      Order,
      { id: data.orderId },
      { populate: ['buyer'] },
    )

    if (order.buyer.id !== userId) {
      throw new BadRequestException('You can only pay for your own orders')
    }

    if (order.paymentMethod !== OrderPaymentMethod.FEDAPAY) {
      throw new BadRequestException('This order uses cash on delivery')
    }

    const existingCompleted = await this.em.findOne(Payment, {
      order: { id: data.orderId },
      status: { $in: [PaymentStatus.CAPTURED, PaymentStatus.ESCROW, PaymentStatus.RELEASED] },
    })

    if (existingCompleted) {
      throw new BadRequestException('A payment already exists for this order')
    }

    // Reuse existing pending payment if one exists
    const existingPending = await this.em.findOne(Payment, {
      order: { id: data.orderId },
      status: PaymentStatus.PENDING,
    })

    if (existingPending) {
      return {
        paymentId: existingPending.id,
        status: 'pending' as const,
      }
    }

    const payment = this.em.create(Payment, {
      order,
      amount: order.totalAmount,
      provider: 'fedapay',
      paymentMethod: 'fedapay_checkout',
      status: PaymentStatus.PENDING,
    })

    await this.em.flush()

    return {
      paymentId: payment.id,
      status: 'pending' as const,
    }
  }

  /**
   * Verifies a payment made via Checkout.js.
   * Frontend sends the paymentId + FedaPay transaction ID after the widget completes.
   */
  async verifyCheckoutPayment(userId: string, data: VerifyCheckoutInput) {
    const order = await this.em.findOneOrFail(
      Order,
      { id: data.orderId },
      { populate: ['buyer'] },
    )

    if (order.buyer.id !== userId) {
      throw new BadRequestException('You can only pay for your own orders')
    }

    const payment = await this.em.findOneOrFail(Payment, {
      id: data.paymentId,
      order: { id: data.orderId },
      status: PaymentStatus.PENDING,
    })

    const gateway = this.gatewayFactory.createGateway(payment.provider)
    const checkResult = await gateway.checkStatus(data.fedapayTransactionId)

    if (checkResult.status !== 'completed') {
      throw new BadRequestException(`Payment not confirmed. Status: ${checkResult.status}`)
    }

    payment.providerTransactionId = data.fedapayTransactionId
    payment.providerReference = checkResult.reference
    payment.providerPaymentMethodId = checkResult.providerPaymentMethodId
    payment.status = PaymentStatus.CAPTURED
    payment.paidAt = checkResult.paidAt ?? new Date()

    await this.em.flush()

    await this.notificationsService.send({
      user: order.buyer,
      type: NotificationType.PAYMENT_RECEIVED,
      title: 'Paiement reçu',
      body: `Votre paiement de ${payment.amount} FCFA a été confirmé`,
      data: { orderId: order.id, paymentId: payment.id },
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    })

    return {
      paymentId: payment.id,
      status: 'completed' as const,
    }
  }

  /**
   * Handles webhook callbacks from all payment providers.
   */
  async handleWebhookCallback(provider: PaymentProvider, payload: unknown, signature?: string) {
    const gateway = this.gatewayFactory.createGateway(provider)
    const webhookResult = await gateway.handleWebhook(payload, signature)

    const payment = await this.em.findOne(
      Payment,
      {
        provider,
        providerTransactionId: webhookResult.providerTransactionId,
      },
      { populate: ['order', 'order.buyer', 'order.supplier', 'order.supplier.user'] },
    )

    if (!payment) {
      this.logger.warn(
        `No payment found for provider=${provider}, transactionId=${webhookResult.providerTransactionId}`,
      )
      return
    }

    if (payment.status === PaymentStatus.CAPTURED
      || payment.status === PaymentStatus.ESCROW
      || payment.status === PaymentStatus.RELEASED
      || payment.status === PaymentStatus.REFUNDED) {
      this.logger.warn(`Payment ${payment.id} already in terminal status: ${payment.status}`)
      return
    }

    if (webhookResult.status === 'completed') {
      payment.status = PaymentStatus.CAPTURED
      payment.paidAt = webhookResult.paidAt ?? new Date()

      await this.notificationsService.send({
        user: payment.order.buyer,
        type: NotificationType.PAYMENT_RECEIVED,
        title: 'Paiement reçu',
        body: `Votre paiement de ${payment.amount} FCFA a été confirmé`,
        data: { orderId: payment.order.id, paymentId: payment.id },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      })
    }
    else if (webhookResult.status === 'failed') {
      payment.status = PaymentStatus.FAILED
    }

    await this.em.flush()
  }

  /**
   * Returns the current payment status for an order.
   */
  async getPaymentStatus(userId: string, orderId: string) {
    const order = await this.em.findOneOrFail(
      Order,
      { id: orderId },
      { populate: ['buyer'] },
    )

    if (order.buyer.id !== userId) {
      throw new BadRequestException('You can only view your own payment status')
    }

    const payment = await this.em.findOne(
      Payment,
      { order: { id: orderId } },
      { orderBy: { createdAt: 'DESC' } },
    )

    if (!payment) {
      throw new NotFoundException('No payment found for this order')
    }

    return {
      paymentId: payment.id,
      status: payment.status,
      amount: payment.amount,
      paidAt: payment.paidAt?.toISOString() ?? null,
      provider: payment.provider as 'fedapay' | 'stripe' | 'pawerpayer',
    }
  }

  /**
   * Releases escrow payment to supplier after delivery confirmation.
   */
  async releaseEscrow(paymentId: string): Promise<Payment> {
    const payment = await this.em.findOneOrFail(Payment, { id: paymentId }, {
      populate: ['order', 'order.supplier', 'order.supplier.user'],
    })

    if (payment.status !== PaymentStatus.CAPTURED && payment.status !== PaymentStatus.ESCROW) {
      throw new BadRequestException(`Cannot release escrow for payment in status ${payment.status}`)
    }

    const supplierAmount = payment.amount - payment.order.commissionAmount

    await this.transferToSupplier(
      payment.order.supplier.mobileMoneyNumber ?? payment.phoneNumber ?? '',
      supplierAmount,
      payment,
    )

    payment.status = PaymentStatus.RELEASED
    payment.releasedAt = new Date()
    payment.order.escrowReleasedAt = new Date()

    await this.em.flush()

    await this.notificationsService.send({
      user: payment.order.supplier.user,
      type: NotificationType.PAYMENT_RELEASED,
      title: 'Paiement libéré',
      body: `${supplierAmount} FCFA ont été transférés sur votre compte`,
      data: { orderId: payment.order.id, paymentId: payment.id, amount: supplierAmount },
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    })

    return payment
  }

  /**
   * Refunds a captured/escrow payment via the gateway.
   */
  async refund(paymentId: string): Promise<Payment> {
    const payment = await this.em.findOneOrFail(Payment, { id: paymentId }, {
      populate: ['order', 'order.buyer'],
    })

    if (payment.status !== PaymentStatus.CAPTURED && payment.status !== PaymentStatus.ESCROW) {
      throw new BadRequestException(`Cannot refund payment in status ${payment.status}`)
    }

    if (payment.providerTransactionId) {
      const gateway = this.gatewayFactory.createGateway(payment.provider)
      const result = await gateway.processRefund(payment.providerTransactionId, payment.amount)

      if (!result.success) {
        this.logger.error(`Refund failed for payment ${payment.id}`)
        throw new BadRequestException('Refund failed at payment provider')
      }
    }

    payment.status = PaymentStatus.REFUNDED
    payment.refundedAt = new Date()

    await this.em.flush()

    await this.notificationsService.send({
      user: payment.order.buyer,
      type: NotificationType.PAYMENT_RECEIVED,
      title: 'Remboursement effectué',
      body: `${payment.amount} FCFA vous ont été remboursés`,
      data: { orderId: payment.order.id, paymentId: payment.id },
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    })

    return payment
  }

  async findByOrderId(orderId: string): Promise<Payment | null> {
    return this.em.findOne(Payment, { order: { id: orderId } })
  }

  private async transferToSupplier(phoneNumber: string, amount: number, payment: Payment): Promise<void> {
    if (config.payments.fedapay.environment === 'sandbox') {
      this.logger.debug(`[SANDBOX] Transfer ${amount} FCFA to ${phoneNumber}`)
      return
    }
    // TODO: Implement actual payout via gateway
    this.logger.warn(`Production transfer not yet implemented for provider ${payment.provider}`)
  }
}
