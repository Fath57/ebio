import type { DeliveryRunHooks } from '../deliveries/deliveries.tokens'
import { EntityManager } from '@mikro-orm/postgresql'
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { DELIVERY_RUN_HOOKS } from '../deliveries/deliveries.tokens'
import { clearLowBalanceAlert, refundDestination, refundTargetWallet } from '../family-wallet/family-payment.service'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { Order, OrderStatus, PaymentMethod } from '../orders/entities/order.entity'
import { WalletTransactionType } from '../wallet/entities/wallet-transaction.entity'
import { WalletService } from '../wallet/wallet.service'
import { Checkout, CheckoutStatus } from './entities/checkout.entity'
import { Payment, PaymentStatus } from './payment.entity'

export interface CompensationResult {
  /** Amount actually credited, 0 when there was nothing to give back. */
  amount: number
  /** Fee difference returned after the run was re-priced. */
  deliveryRefund: number
  /** True when the compensation had already happened. */
  alreadyDone: boolean
  checkoutStatus: CheckoutStatus | null
  /** Delivery fee kept back (`withholdDeliveryFee`), 0 otherwise. */
  withheld: number
}

export interface CompensationOptions {
  /**
   * The courier made the trip and is paid for it: the buyer gets the order
   * back minus its delivery fee. A failed hand-over to a relative (research §5).
   * The caller tells the buyer itself, with the reason.
   */
  withholdDeliveryFee?: boolean
}

/**
 * Compensates the buyer when an order of a unified cart falls through.
 *
 * Mobile Money can neither hold funds nor give part of them back: one payment
 * covers N orders, and if one is refused there is no way to undo a third of it
 * at the provider. The eBio wallet is the only immediate answer, and the buyer
 * can withdraw from it through the existing mechanisms.
 *
 * Everything goes through here, whatever the path — shop refusal, admin
 * cancellation, expiry: a replay never credits twice.
 */
@Injectable()
export class CompensationService {
  private readonly logger = new Logger(CompensationService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly walletService: WalletService,
    private readonly notificationsService: NotificationsService,
    @Inject(DELIVERY_RUN_HOOKS)
    private readonly runHooks: DeliveryRunHooks,
  ) {}

  /**
   * Has this order's money already been given back?
   *
   * The key is the order, not the call: that is what makes the operation safe
   * however many times it is triggered.
   */
  private async alreadyCompensated(orderId: string): Promise<boolean> {
    const rows = await this.em.getConnection().execute(
      `SELECT 1 FROM wallet_transactions
       WHERE order_id = ? AND type = 'REFUND' AND delivery_run_id IS NULL LIMIT 1`,
      [orderId],
    )
    return rows.length > 0
  }

  async compensateOrder(orderId: string, reason: string, options: CompensationOptions = {}): Promise<CompensationResult> {
    const order = await this.em.findOne(Order, { id: orderId }, { populate: ['buyer', 'supplier', 'checkout'] })
    if (!order) {
      throw new NotFoundException('Commande introuvable')
    }
    const checkout = order.checkout
      ? await this.em.findOne(Checkout, { id: order.checkout.id })
      : null

    if (await this.alreadyCompensated(orderId)) {
      return {
        amount: 0,
        deliveryRefund: 0,
        alreadyDone: true,
        checkoutStatus: checkout?.status ?? null,
        withheld: 0,
      }
    }

    // With cash, the money never left the buyer: there is nothing to give
    // back, only an order that will not happen.
    if (order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY) {
      const status = checkout ? await this.refreshCheckoutStatus(checkout) : null
      return { amount: 0, deliveryRefund: 0, alreadyDone: false, checkoutStatus: status, withheld: 0 }
    }

    // Never paid (Mobile Money abandoned before confirmation): crediting the
    // total would hand out money that never came in.
    const payment = await this.em.findOne(Payment, {
      order: { id: order.id },
      status: { $in: [PaymentStatus.CAPTURED, PaymentStatus.ESCROW] },
    })
    if (!payment) {
      const status = checkout ? await this.refreshCheckoutStatus(checkout) : null
      return { amount: 0, deliveryRefund: 0, alreadyDone: false, checkoutStatus: status, withheld: 0 }
    }

    const withheld = options.withholdDeliveryFee ? Math.round(Math.max(0, order.deliveryFee ?? 0)) : 0
    const amount = Math.max(0, Math.round(order.totalAmount) - withheld)
    // A cart paid from a family wallet goes back there (the member's month
    // with it), or to its payer once it is closed — never to the member.
    const target = await refundTargetWallet(this.em, this.walletService, checkout, order.buyer.id)

    if (amount > 0) {
      await this.walletService.credit(target.walletId, {
        type: WalletTransactionType.REFUND,
        amount,
        description: withheld > 0
          ? `Remboursement — commande ${order.orderNumber} : ${reason} (frais de livraison de ${withheld.toLocaleString('fr-FR')} FCFA retenus)`
          : `Remboursement — commande ${order.orderNumber} : ${reason}`,
        orderId: order.id,
        paymentId: payment.id,
        familyMemberId: target.familyMemberId,
      })
    }
    payment.status = PaymentStatus.REFUNDED
    payment.refundedAt = new Date()
    await this.em.flush()

    // The shop leaves the run: the ride gets shorter, so does the fee. What
    // the buyer overpaid comes back to them.
    // With the fee withheld the ride did happen: nothing to re-price.
    const deliveryRefund = checkout && !options.withholdDeliveryFee
      ? await this.settleRunAfterRemoval(checkout, order, target.walletId, target.familyMemberId)
      : 0
    if (target.familyWalletId) {
      await clearLowBalanceAlert(this.em, target.familyWalletId)
    }

    const checkoutStatus = checkout ? await this.refreshCheckoutStatus(checkout) : null

    if (options.withholdDeliveryFee) {
      return { amount, deliveryRefund, alreadyDone: false, checkoutStatus, withheld }
    }

    await this.notificationsService.send({
      user: order.buyer,
      type: NotificationType.ORDER_REJECTED,
      title: 'Montant recrédité',
      body: amount + deliveryRefund > 0
        ? `${(amount + deliveryRefund).toLocaleString('fr-FR')} FCFA ont été recrédités ${refundDestination(target)} — commande ${order.orderNumber} : ${reason}`
        : `Votre commande ${order.orderNumber} n'a pas pu être honorée : ${reason}`,
      data: { orderId: order.id, amount: amount + deliveryRefund, reason },
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    })

    return { amount, deliveryRefund, alreadyDone: false, checkoutStatus, withheld: 0 }
  }

  /**
   * Removes the shop from its run and returns the fee difference, if any.
   *
   * The fee is single and paid up front; if the run loses a pickup it costs
   * less to ride. Keeping the difference would amount to charging for a trip
   * that will not happen.
   */
  private async settleRunAfterRemoval(checkout: Checkout, order: Order, walletId: string, familyMemberId: string | undefined): Promise<number> {
    try {
      const outcome = await this.runHooks.removeSupplierFromRun({
        checkoutId: checkout.id,
        supplierId: order.supplier.id,
      })
      if (outcome === null || outcome.refund <= 0) {
        return 0
      }
      await this.walletService.credit(walletId, {
        type: WalletTransactionType.REFUND,
        amount: outcome.refund,
        description: `Ajustement des frais de livraison — commande ${order.orderNumber}`,
        orderId: order.id,
        // The run tells this adjustment apart from the order's refund. Without
        // it, an adjustment written first would look like the money had already
        // been given back, and would block the real refund forever.
        deliveryRunId: outcome.runId,
        familyMemberId,
      })
      checkout.deliveryFee = Math.max(0, checkout.deliveryFee - outcome.refund)
      checkout.totalAmount = Math.max(0, checkout.totalAmount - outcome.refund)
      await this.em.flush()
      return outcome.refund
    }
    catch (error) {
      // A failed adjustment must not hold back the main refund, which is the
      // amount the buyer is really waiting for.
      this.logger.error(
        `Delivery fee adjustment failed for order ${order.id}`,
        error instanceof Error ? error.stack : String(error),
      )
      return 0
    }
  }

  /**
   * A cart whose orders have all fallen through is refunded; if one still
   * stands, it is partially refunded. The state is derived from the orders, it
   * is not written by hand.
   */
  private async refreshCheckoutStatus(checkout: Checkout): Promise<CheckoutStatus> {
    const orders = await this.em.find(Order, { checkout: { id: checkout.id } })
    const cancelled = orders.filter(item => item.status === OrderStatus.CANCELLED).length
    if (cancelled === 0) {
      return checkout.status
    }
    checkout.status = cancelled === orders.length
      ? CheckoutStatus.REFUNDED
      : CheckoutStatus.PARTIALLY_REFUNDED
    await this.em.flush()
    return checkout.status
  }
}
