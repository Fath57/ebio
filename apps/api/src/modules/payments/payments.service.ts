import type { InitiateCartPayment, InitiateCheckoutInput, InitiatePayment, VerifyCartPayment, VerifyCheckoutInput } from './contracts/payment.contract'
import type { CheckStatusResult } from './gateways/payment-gateway.interface'
import { EnsureRequestContext } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { config } from '../../config/env.config'
import { Delivery, DeliveryStatus } from '../deliveries/entities/delivery.entity'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { Order, PaymentMethod as OrderPaymentMethod, OrderStatus } from '../orders/entities/order.entity'
import { OrderEmailsService } from '../orders/order-emails.service'
import { ProviderTransactionKind, ProviderTransactionStatus } from '../provider-transactions/provider-transaction.entity'
import { ProviderTransactionsService } from '../provider-transactions/provider-transactions.service'
import { WalletTransactionType } from '../wallet/entities/wallet-transaction.entity'
import { PlatformAccount } from '../wallet/entities/wallet.entity'
import { WalletService } from '../wallet/wallet.service'
import { CommissionService } from './commission.service'
import { Checkout, CheckoutStatus } from './entities/checkout.entity'
import { PaymentMethod } from './entities/payment-method.entity'
import { PaymentGatewayFactory } from './gateways/payment-gateway.factory'
import { Payment, PaymentProvider, PaymentStatus } from './payment.entity'
import { providerForTransaction } from './provider-for-transaction'

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly notificationsService: NotificationsService,
    private readonly commissionService: CommissionService,
    private readonly gatewayFactory: PaymentGatewayFactory,
    private readonly walletService: WalletService,
    private readonly orderEmails: OrderEmailsService,
    private readonly journal: ProviderTransactionsService,
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
   * The provider behind the in-app widget.
   *
   * The apps embed one provider's script and hand back its transaction
   * reference; reading it from configuration rather than hard-coding FedaPay
   * is what lets a build switch without a migration — the payments already
   * recorded keep their own provider, since each row carries it.
   */
  private checkoutProvider(): PaymentProvider {
    return config.payments.checkoutProvider === 'intram'
      ? PaymentProvider.INTRAM
      : PaymentProvider.FEDAPAY
  }

  /**
   * Creates a pending Payment before opening the provider's widget.
   * Returns the paymentId so the frontend can pass it in the widget metadata.
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
      // Whichever widget the apps embed: the payment must be born under the
      // provider that will later be asked to vouch for it.
      provider: this.checkoutProvider(),
      paymentMethod: `${this.checkoutProvider()}_checkout`,
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
      throw new BadRequestException({
        code: checkResult.status === 'failed' ? 'payment_failed' : 'payment_pending',
        message: `Paiement non confirmé. Statut : ${checkResult.status}`,
      })
    }

    payment.providerTransactionId = data.fedapayTransactionId
    payment.providerReference = checkResult.reference
    payment.providerPaymentMethodId = checkResult.providerPaymentMethodId
    payment.status = PaymentStatus.CAPTURED
    payment.paidAt = checkResult.paidAt ?? new Date()
    // Payment confirmed: the order becomes real for the shop.
    if (order.status === OrderStatus.PENDING_PAYMENT) {
      order.status = OrderStatus.PLACED
    }

    await this.em.flush()

    await this.notificationsService.send({
      user: order.buyer,
      type: NotificationType.PAYMENT_RECEIVED,
      title: 'Paiement reçu',
      body: `Votre paiement de ${payment.amount} FCFA a été confirmé`,
      data: { orderId: order.id, paymentId: payment.id },
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    })

    await this.sendOrderPlacedNotifications(order.id)
    void this.orderEmails.sendOrderPlaced(order.id)

    return {
      paymentId: payment.id,
      status: 'completed' as const,
    }
  }

  /**
   * Opens a single payment for a multi-shop cart.
   *
   * Nothing is created on the `Payment` side at this point: it owns a
   * `@OneToOne(Order)` and therefore only exists per order. The checkout
   * carries the provider's transaction, and per-order payments are born at
   * confirmation — one per order, each with its own escrow, so that a shop is
   * paid at its own pace rather than the slowest one's.
   */
  async initiateCartPayment(userId: string, data: InitiateCartPayment) {
    const checkout = await this.em.findOneOrFail(Checkout, { id: data.checkoutId }, { populate: ['buyer'] })
    if (checkout.buyer.id !== userId) {
      throw new BadRequestException('Vous ne pouvez payer que votre propre panier')
    }
    if (checkout.status !== CheckoutStatus.PENDING) {
      throw new BadRequestException('Ce panier a déjà été payé')
    }

    const orders = await this.em.find(Order, { checkout: { id: checkout.id } })
    if (orders.length === 0) {
      throw new BadRequestException('Ce panier ne contient aucune commande')
    }

    // Opening the payment here, rather than letting the phone do it, is what
    // makes the transaction id trustworthy: it is ours before the buyer sees
    // a page, so confirmation compares against something the client never
    // chose. It also spares the app the provider's widget entirely.
    const gateway = this.gatewayFactory.createGateway(this.checkoutProvider())

    // Only for a provider that hands over a page. A widget-based one opens
    // its own transaction on the phone, and pre-opening here would leave an
    // orphan beside it.
    if (gateway.hostsPaymentPage?.() !== true) {
      return {
        checkoutId: checkout.id,
        amount: checkout.totalAmount,
        status: 'pending' as const,
        paymentIds: [],
        paymentUrl: null,
        providerTransactionId: null,
      }
    }

    // One journal line per attempt, written before the provider is called:
    // a retry no longer erases the attempt before it, and a refused opening
    // is written down too.
    const operation = await this.journal.open({
      provider: this.checkoutProvider(),
      kind: ProviderTransactionKind.CART_PAYMENT,
      subjectId: checkout.id,
      amount: checkout.totalAmount,
    })
    let opened
    try {
      opened = await gateway.initiatePayment({
        amount: checkout.totalAmount,
        currency: 'XOF',
        orderId: checkout.id,
        paymentMethod: '',
        callbackUrl: config.payments.returnUrl,
      })
    }
    catch (error) {
      const reason = String((error as Error)?.message ?? error)
      this.logger.error(`Ouverture du paiement refusée pour le panier ${checkout.id} : ${reason}`)
      await this.journal.markFailed(operation, reason)
      throw new BadRequestException('Le paiement n\'a pas pu être ouvert. Réessayez dans un instant.')
    }
    if (!opened.providerTransactionId) {
      await this.journal.markFailed(operation, 'Aucune référence de transaction rendue')
      throw new BadRequestException('Le paiement n\'a pas pu être ouvert. Réessayez dans un instant.')
    }

    checkout.providerTransactionId = opened.providerTransactionId

    await this.em.flush()
    await this.journal.attachReference(operation, opened.providerTransactionId)

    return {
      checkoutId: checkout.id,
      amount: checkout.totalAmount,
      status: 'pending' as const,
      paymentIds: [],
      paymentUrl: opened.redirectUrl ?? null,
      providerTransactionId: opened.providerTransactionId,
    }
  }

  /**
   * Confirms the single payment, then creates one payment per order.
   *
   * The verified amount is the cart's; it is then split across the orders in
   * proportion to their totals, so that the sum of the payments matches
   * exactly what was collected, to the franc.
   */
  async verifyCartPayment(userId: string, data: VerifyCartPayment) {
    const checkout = await this.em.findOneOrFail(Checkout, { id: data.checkoutId }, { populate: ['buyer'] })
    if (checkout.buyer.id !== userId) {
      throw new BadRequestException('Vous ne pouvez payer que votre propre panier')
    }

    const orders = await this.em.find(Order, { checkout: { id: checkout.id } }, { populate: ['buyer'] })
    if (orders.length === 0) {
      throw new BadRequestException('Ce panier ne contient aucune commande')
    }

    // Replaying the confirmation must not create a second set of payments.
    if (checkout.status !== CheckoutStatus.PENDING) {
      const existing = await this.em.find(Payment, { checkout: { id: checkout.id } })
      return {
        checkoutId: checkout.id,
        amount: checkout.totalAmount,
        status: 'completed' as const,
        paymentIds: existing.map(payment => payment.id),
      }
    }

    // Same reason as the wallet top-up: we follow the transaction presented,
    // not the provider of the day. Apps from before the switch still pay with
    // the old one.
    const provider = providerForTransaction(
      data.fedapayTransactionId,
      checkout.providerTransactionId ?? null,
    )
    const gateway = this.gatewayFactory.createGateway(provider)
    const checkResult = await gateway.checkStatus(data.fedapayTransactionId)
    await this.journal.recordOutcome(data.fedapayTransactionId, toOutcome(checkResult.status))
    if (checkResult.status !== 'completed') {
      // Same two shapes as a wallet topup: the app has to tell a payment that
      // failed from one still in flight, or it waits on a dead page.
      throw new BadRequestException({
        code: checkResult.status === 'failed' || checkResult.status === 'refunded' ? 'payment_failed' : 'payment_pending',
        message: `Paiement non confirmé. Statut : ${checkResult.status}`,
      })
    }

    const payments = await this.confirmCheckout(checkout, orders, data.fedapayTransactionId, provider, checkResult)
    return {
      checkoutId: checkout.id,
      amount: checkout.totalAmount,
      status: 'completed' as const,
      paymentIds: payments.map(payment => payment.id),
    }
  }

  /**
   * A cart the provider confirmed as paid: one payment per order, the orders
   * shown to their shops, the buyer told. Shared by the app's verification and
   * the reconciliation, so both settle a cart the same way.
   *
   * The amount is checked against the cart's: a mismatch is never confirmed,
   * it is left for a person to look at.
   */
  private async confirmCheckout(
    checkout: Checkout,
    orders: Order[],
    reference: string,
    provider: PaymentProvider,
    checkResult: CheckStatusResult,
  ): Promise<Payment[]> {
    if (checkResult.amount !== undefined && checkResult.amount !== Math.round(checkout.totalAmount)) {
      this.logger.error(`Panier ${checkout.id} : ${checkResult.amount} payés, ${checkout.totalAmount} attendus — à régler à la main`)
      throw new BadRequestException('Le montant payé ne correspond pas au panier')
    }

    checkout.providerTransactionId = reference
    checkout.status = CheckoutStatus.PAID

    const payments = splitCheckoutAmount(checkout.totalAmount, orders).map(({ order, amount }) =>
      this.em.create(Payment, {
        checkout,
        order,
        amount,
        provider,
        paymentMethod: `${provider}_checkout`,
        providerTransactionId: reference,
        providerReference: checkResult.reference,
        providerPaymentMethodId: checkResult.providerPaymentMethodId,
        status: PaymentStatus.CAPTURED,
        paidAt: checkResult.paidAt ?? new Date(),
      }),
    )

    for (const order of orders) {
      if (order.status === OrderStatus.PENDING_PAYMENT) {
        order.status = OrderStatus.PLACED
      }
    }

    await this.em.flush()

    await this.notificationsService.send({
      user: checkout.buyer,
      type: NotificationType.PAYMENT_RECEIVED,
      title: 'Paiement reçu',
      body: `Votre paiement de ${checkout.totalAmount} FCFA a été confirmé`,
      data: { checkoutId: checkout.id },
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    })

    for (const order of orders) {
      await this.sendOrderPlacedNotifications(order.id)
      void this.orderEmails.sendOrderPlaced(order.id)
    }

    return payments
  }

  /**
   * Re-reads every cart payment still open at the provider.
   *
   * Same reason as the topups: the buyer is sent back before the operator has
   * answered, and the app stops asking when its screen closes. A cart paid
   * late is confirmed here; one that failed or was abandoned is only written
   * down — its orders are cancelled after 24 h by the orders module.
   */
  @Cron('1-59/2 * * * *')
  @EnsureRequestContext()
  async reconcilePendingCarts(): Promise<void> {
    await this.journalUnrecordedCarts()

    const operations = await this.journal.findToReconcile(ProviderTransactionKind.CART_PAYMENT)
    for (const operation of operations) {
      try {
        const provider = operation.provider as PaymentProvider
        const check = await this.gatewayFactory.createGateway(provider).checkStatus(operation.reference!)
        const status = await this.journal.recordOutcome(operation.reference!, toOutcome(check.status))
        if (status !== ProviderTransactionStatus.COMPLETED) {
          continue
        }
        const checkout = await this.em.findOne(Checkout, { id: operation.subjectId }, { populate: ['buyer'] })
        if (!checkout) {
          continue
        }
        if (checkout.status !== CheckoutStatus.PENDING) {
          // Paid through another attempt already: this one took money twice.
          if (checkout.providerTransactionId !== operation.reference) {
            this.logger.error(`Panier ${checkout.id} payé deux fois (${operation.reference} en plus de ${checkout.providerTransactionId}) — remboursement à faire`)
          }
          continue
        }
        const orders = await this.em.find(Order, { checkout: { id: checkout.id } }, { populate: ['buyer'] })
        await this.confirmCheckout(checkout, orders, operation.reference!, provider, check)
        this.logger.log(`Panier ${checkout.id} confirmé par le rapprochement`)
      }
      catch (error) {
        this.logger.warn(`Rapprochement du panier ${operation.subjectId} impossible : ${String((error as Error)?.message ?? error)}`)
      }
    }
  }

  /** Carts opened before the journal existed get their line. */
  private async journalUnrecordedCarts(): Promise<void> {
    const rows = await this.em.getConnection().execute<Array<{ id: string, reference: string, amount: number, created: Date }>>(
      `SELECT c.id, c.provider_transaction_id AS reference, c.total_amount AS amount, c."createdAt" AS created
       FROM checkouts c
       WHERE c.status = 'PENDING' AND c.provider_transaction_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM provider_transactions p WHERE p.reference = c.provider_transaction_id)`,
    )
    for (const row of rows) {
      const operation = await this.journal.open({
        provider: providerForTransaction(row.reference, null),
        kind: ProviderTransactionKind.CART_PAYMENT,
        subjectId: row.id,
        amount: Number(row.amount),
      })
      operation.createdAt = new Date(row.created)
      await this.journal.attachReference(operation, row.reference)
    }
  }

  private async sendOrderPlacedNotifications(orderId: string): Promise<void> {
    const order = await this.em.findOneOrFail(Order, { id: orderId }, {
      populate: ['buyer', 'supplier', 'supplier.user'],
    })
    await Promise.all([
      this.notificationsService.send({
        user: order.supplier.user,
        type: NotificationType.ORDER_PLACED,
        title: 'Nouvelle commande',
        body: `Commande ${order.orderNumber} reçue pour ${order.totalAmount} FCFA`,
        data: { orderId: order.id, orderNumber: order.orderNumber },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      }),
      this.notificationsService.send({
        user: order.buyer,
        type: NotificationType.ORDER_PLACED,
        title: 'Commande confirmée',
        body: `Votre commande ${order.orderNumber} a été envoyée au fournisseur`,
        data: { orderId: order.id, orderNumber: order.orderNumber },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      }),
    ])
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
      if (payment.order.status === OrderStatus.PENDING_PAYMENT) {
        payment.order.status = OrderStatus.PLACED
      }

      await this.notificationsService.send({
        user: payment.order.buyer,
        type: NotificationType.PAYMENT_RECEIVED,
        title: 'Paiement reçu',
        body: `Votre paiement de ${payment.amount} FCFA a été confirmé`,
        data: { orderId: payment.order.id, paymentId: payment.id },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      })

      await this.sendOrderPlacedNotifications(payment.order.id)
      void this.orderEmails.sendOrderPlaced(payment.order.id)
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
      provider: payment.provider as 'fedapay' | 'stripe' | 'pawerpayer' | 'intram',
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

    // A platform courier delivered this order: the delivery fee the buyer paid
    // was already split at completion between the courier (DELIVERY_EARNING)
    // and eBio, so it is not the shop's money. Self-delivered orders keep the
    // fee in the shop credit. Entity-only lookup: PaymentsModule must not
    // depend on DeliveriesModule.
    const courierDelivery = await this.em.findOne(Delivery, {
      order: { id: payment.order.id },
      status: DeliveryStatus.DELIVERED,
      courier: { $ne: null },
    })
    const courierDeliveryFee = courierDelivery ? payment.order.deliveryFee : 0
    const supplierAmount = Math.max(
      0,
      Math.round((payment.amount - payment.order.commissionAmount - courierDeliveryFee) * 100) / 100,
    )

    // The money already sits on the platform account: releasing the escrow is
    // an internal credit to the shop wallet. The supplier withdraws it later
    // through a payout request.
    const wallet = await this.walletService.getOrCreate({ supplierId: payment.order.supplier.id })
    await this.walletService.credit(wallet.id, {
      type: WalletTransactionType.SALE_CREDIT,
      amount: supplierAmount,
      description: `Vente ${payment.order.orderNumber}`,
      orderId: payment.order.id,
      paymentId: payment.id,
    })

    // A platform promo is eBio's marketing cost, not the shop's: pay the
    // discounted difference back so the shop nets as if full price.
    if (payment.order.discountFundedBy === 'PLATFORM' && payment.order.discountAmount > 0) {
      await this.walletService.credit(wallet.id, {
        type: WalletTransactionType.PROMO_COMPENSATION,
        amount: payment.order.discountAmount,
        description: `Compensation code promo — ${payment.order.orderNumber}`,
        orderId: payment.order.id,
      })
    }
    if (payment.order.platformPromoCompensation > 0) {
      await this.walletService.credit(wallet.id, {
        type: WalletTransactionType.PROMO_COMPENSATION,
        amount: payment.order.platformPromoCompensation,
        description: `Compensation promotion eBio — ${payment.order.orderNumber}`,
        orderId: payment.order.id,
      })
    }

    // eBio's own books: the commission it just kept, and what its own
    // promotions cost it on this order.
    await this.walletService.post(PlatformAccount.SALES_COMMISSION, 'credit', {
      type: WalletTransactionType.PLATFORM_COMMISSION,
      amount: payment.order.commissionAmount,
      description: `Commission — commande ${payment.order.orderNumber}`,
      orderId: payment.order.id,
      paymentId: payment.id,
    })
    const platformMarketingCost = payment.order.platformPromoCompensation
      + (payment.order.discountFundedBy === 'PLATFORM' ? payment.order.discountAmount : 0)
    await this.walletService.post(PlatformAccount.MARKETING, 'debit', {
      type: WalletTransactionType.PLATFORM_MARKETING,
      amount: platformMarketingCost,
      description: `Promotions eBio — commande ${payment.order.orderNumber}`,
      orderId: payment.order.id,
    })

    payment.status = PaymentStatus.RELEASED
    payment.releasedAt = new Date()
    payment.order.escrowReleasedAt = new Date()

    await this.em.flush()

    await this.notificationsService.send({
      user: payment.order.supplier.user,
      type: NotificationType.PAYMENT_RELEASED,
      title: 'Paiement libéré',
      body: `${supplierAmount} FCFA ont été crédités sur votre portefeuille boutique`,
      data: { orderId: payment.order.id, paymentId: payment.id, amount: supplierAmount },
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    })

    return payment
  }

  async findByOrderId(orderId: string): Promise<Payment | null> {
    return this.em.findOne(Payment, { order: { id: orderId } })
  }
}

/**
 * Splits the collected amount across the orders, in proportion to their
 * totals.
 *
 * Rounding must neither lose nor invent anything: the last one gets the
 * remainder, so that the shares add up exactly to what was collected. Without
 * that, a three-shop cart can end up a franc over or under in the books, and
 * that franc lands in somebody's wallet.
 */
export function splitCheckoutAmount<T extends { totalAmount: number }>(
  total: number,
  orders: T[],
): Array<{ order: T, amount: number }> {
  const ordersTotal = orders.reduce((sum, order) => sum + order.totalAmount, 0)
  if (ordersTotal <= 0) {
    return orders.map(order => ({ order, amount: 0 }))
  }
  let allocated = 0
  return orders.map((order, index) => {
    const isLast = index === orders.length - 1
    const amount = isLast
      ? total - allocated
      : Math.round((total * order.totalAmount) / ordersTotal)
    allocated += amount
    return { order, amount }
  })
}

/** The gateways' vocabulary, folded into the journal's three outcomes. */
function toOutcome(status: string): 'completed' | 'failed' | 'pending' {
  if (status === 'completed') {
    return 'completed'
  }
  return status === 'failed' || status === 'refunded' ? 'failed' : 'pending'
}
