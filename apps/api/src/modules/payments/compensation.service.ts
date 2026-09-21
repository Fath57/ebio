import type { DeliveryRunHooks } from '../deliveries/deliveries.tokens'
import { EntityManager } from '@mikro-orm/postgresql'
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { DELIVERY_RUN_HOOKS } from '../deliveries/deliveries.tokens'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { Order, OrderStatus, PaymentMethod } from '../orders/entities/order.entity'
import { WalletTransactionType } from '../wallet/entities/wallet-transaction.entity'
import { WalletService } from '../wallet/wallet.service'
import { Checkout, CheckoutStatus } from './entities/checkout.entity'
import { Payment, PaymentStatus } from './payment.entity'

export interface CompensationResult {
  /** Montant réellement crédité, 0 quand il n'y avait rien à rendre. */
  amount: number
  /** Écart de frais rendu après recalcul de la tournée. */
  deliveryRefund: number
  /** Vrai quand le dédommagement avait déjà eu lieu. */
  alreadyDone: boolean
  checkoutStatus: CheckoutStatus | null
}

/**
 * Dédommager l'acheteur quand une commande d'un panier unifié tombe.
 *
 * Le Mobile Money ne sait ni geler des fonds ni en rendre une partie : un
 * paiement unique couvre N commandes, et si l'une est refusée il n'existe
 * aucun moyen d'en défaire le tiers chez le prestataire. Le portefeuille eBio
 * est la seule réponse immédiate, et l'acheteur peut en demander le retrait
 * par les mécanismes existants.
 *
 * Tout passe par ici, quel que soit le chemin — refus boutique, annulation
 * admin, expiration : un rejeu ne crédite jamais deux fois.
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
   * A-t-on déjà rendu l'argent de cette commande ?
   *
   * La clé est la commande, pas l'appel : c'est ce qui rend l'opération sûre
   * quel que soit le nombre de fois où on la déclenche.
   */
  private async alreadyCompensated(orderId: string): Promise<boolean> {
    const rows = await this.em.getConnection().execute(
      `SELECT 1 FROM wallet_transactions
       WHERE order_id = ? AND type = 'REFUND' AND delivery_run_id IS NULL LIMIT 1`,
      [orderId],
    )
    return rows.length > 0
  }

  async compensateOrder(orderId: string, reason: string): Promise<CompensationResult> {
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
      }
    }

    // En espèces, l'argent n'a jamais quitté l'acheteur : il n'y a rien à
    // rendre, seulement une commande qui ne se fera pas.
    if (order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY) {
      const status = checkout ? await this.refreshCheckoutStatus(checkout) : null
      return { amount: 0, deliveryRefund: 0, alreadyDone: false, checkoutStatus: status }
    }

    const amount = Math.round(order.totalAmount)
    const wallet = await this.walletService.getOrCreate({ userId: order.buyer.id })
    const payment = await this.em.findOne(Payment, {
      order: { id: order.id },
      status: { $in: [PaymentStatus.CAPTURED, PaymentStatus.ESCROW] },
    })

    if (amount > 0) {
      await this.walletService.credit(wallet.id, {
        type: WalletTransactionType.REFUND,
        amount,
        description: `Remboursement — commande ${order.orderNumber} : ${reason}`,
        orderId: order.id,
        paymentId: payment?.id,
      })
    }
    if (payment) {
      payment.status = PaymentStatus.REFUNDED
      payment.refundedAt = new Date()
    }
    await this.em.flush()

    // La boutique quitte la tournée : le trajet raccourcit, donc le frais
    // aussi. Ce que l'acheteur a payé en trop lui revient.
    const deliveryRefund = checkout
      ? await this.settleRunAfterRemoval(checkout, order, wallet.id)
      : 0

    const checkoutStatus = checkout ? await this.refreshCheckoutStatus(checkout) : null

    await this.notificationsService.send({
      user: order.buyer,
      type: NotificationType.ORDER_REJECTED,
      title: 'Montant recrédité',
      body: amount + deliveryRefund > 0
        ? `${(amount + deliveryRefund).toLocaleString('fr-FR')} FCFA ont été recrédités sur votre portefeuille eBio — commande ${order.orderNumber} : ${reason}`
        : `Votre commande ${order.orderNumber} n'a pas pu être honorée : ${reason}`,
      data: { orderId: order.id, amount: amount + deliveryRefund, reason },
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    })

    return { amount, deliveryRefund, alreadyDone: false, checkoutStatus }
  }

  /**
   * Retire la boutique de sa tournée et rend l'écart de frais s'il y en a un.
   *
   * Le frais est unique et payé d'avance ; si la tournée perd une collecte,
   * elle coûte moins cher à faire. Garder la différence reviendrait à facturer
   * un trajet qui n'aura pas lieu.
   */
  private async settleRunAfterRemoval(checkout: Checkout, order: Order, walletId: string): Promise<number> {
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
        // La tournée distingue cet ajustement du remboursement de la commande.
        // Sans elle, un ajustement écrit le premier ferait croire que l'argent
        // a déjà été rendu, et bloquerait le vrai remboursement pour toujours.
        deliveryRunId: outcome.runId,
      })
      checkout.deliveryFee = Math.max(0, checkout.deliveryFee - outcome.refund)
      checkout.totalAmount = Math.max(0, checkout.totalAmount - outcome.refund)
      await this.em.flush()
      return outcome.refund
    }
    catch (error) {
      // Un ajustement raté ne doit pas retenir le remboursement principal,
      // qui est le montant que l'acheteur attend vraiment.
      this.logger.error(
        `Delivery fee adjustment failed for order ${order.id}`,
        error instanceof Error ? error.stack : String(error),
      )
      return 0
    }
  }

  /**
   * Un panier dont toutes les commandes sont tombées est remboursé ; s'il en
   * reste une debout, il est partiellement remboursé. L'état se déduit des
   * commandes, il ne s'écrit pas à la main.
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
