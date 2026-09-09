import type { CourierTipResponse, RateCourier, TipCourier } from './contracts/delivery.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { WalletTransactionType } from '../wallet/entities/wallet-transaction.entity'
import { WalletService } from '../wallet/wallet.service'
import { CourierRating } from './entities/courier-rating.entity'
import { CourierTip } from './entities/courier-tip.entity'
import { Delivery, DeliveryStatus } from './entities/delivery.entity'

/**
 * What the buyer says about the courier once the parcel is in their hands:
 * a rating that feeds the courier's public average, and an optional tip that
 * moves from the buyer's personal wallet to the courier wallet in full.
 */
@Injectable()
export class CourierFeedbackService {
  private readonly logger = new Logger(CourierFeedbackService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly walletService: WalletService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findRating(deliveryId: string): Promise<CourierRating | null> {
    return this.em.findOne(CourierRating, { delivery: { id: deliveryId } })
  }

  async rate(deliveryId: string, buyerUserId: string, data: RateCourier): Promise<CourierRating> {
    const delivery = await this.loadDeliveredForBuyer(deliveryId, buyerUserId)
    const courier = delivery.courier!
    const existing = await this.findRating(delivery.id)
    if (existing) {
      throw new ConflictException('Vous avez déjà noté ce livreur pour cette livraison')
    }

    const buyer = await this.em.findOneOrFail(User, { id: buyerUserId })
    const rating = this.em.create(CourierRating, {
      delivery,
      courier,
      buyer,
      order: delivery.order,
      rating: data.rating,
      comment: data.comment || undefined,
    })
    await this.em.flush()
    await this.refreshCourierAverage(courier.id)

    await this.notify(courier.user.id, {
      type: NotificationType.COURIER_RATED,
      title: 'Nouvelle note reçue',
      body: `${buyer.name} vous a donné ${data.rating}/5 pour la commande #${delivery.order.orderNumber}`,
      data: { deliveryId: delivery.id, orderId: delivery.order.id, rating: data.rating },
    })
    return rating
  }

  async tip(deliveryId: string, buyerUserId: string, data: TipCourier): Promise<CourierTipResponse> {
    const delivery = await this.loadDeliveredForBuyer(deliveryId, buyerUserId)
    const courier = delivery.courier!
    const alreadyTipped = await this.em.findOne(CourierTip, { delivery: { id: delivery.id } })
    if (alreadyTipped) {
      throw new ConflictException('Un pourboire a déjà été laissé pour cette livraison')
    }

    const amount = Math.round(data.amount)
    const order = delivery.order
    const buyerWallet = await this.walletService.getOrCreate({ userId: buyerUserId })
    // The buyer wallet is debited first; a failed courier credit refunds it so
    // the buyer never pays for a tip that did not reach the courier.
    const walletBalance = await this.walletService.debit(buyerWallet.id, {
      type: WalletTransactionType.TIP_PAYMENT,
      amount,
      description: `Pourboire au livreur — commande #${order.orderNumber}`,
      orderId: order.id,
      deliveryId: delivery.id,
    })
    try {
      const courierWallet = await this.walletService.getOrCreate({ courierId: courier.id })
      await this.walletService.credit(courierWallet.id, {
        type: WalletTransactionType.TIP_EARNING,
        amount,
        description: `Pourboire reçu — commande #${order.orderNumber}`,
        orderId: order.id,
        deliveryId: delivery.id,
      })
    }
    catch (error) {
      this.logger.error(`Tip credit failed for delivery ${delivery.id}, refunding the buyer`, error instanceof Error ? error.stack : String(error))
      await this.walletService.credit(buyerWallet.id, {
        type: WalletTransactionType.REFUND,
        amount,
        description: `Remboursement du pourboire — commande #${order.orderNumber}`,
        orderId: order.id,
        deliveryId: delivery.id,
      })
      throw new BadRequestException('Le pourboire n\'a pas pu être versé, vous avez été remboursé')
    }

    const buyer = await this.em.findOneOrFail(User, { id: buyerUserId })
    const tip = this.em.create(CourierTip, { delivery, courier, buyer, order, amount })
    delivery.tipAmount = amount
    await this.em.flush()

    await this.notify(courier.user.id, {
      type: NotificationType.COURIER_TIP,
      title: 'Pourboire reçu',
      body: `${buyer.name} vous a laissé ${amount.toLocaleString('fr-FR')} FCFA pour la commande #${order.orderNumber}`,
      data: { deliveryId: delivery.id, orderId: order.id, amount },
    })
    return { amount, walletBalance, createdAt: tip.createdAt.toISOString() }
  }

  /** Average and count come straight from the ratings table, never drift. */
  private async refreshCourierAverage(courierId: string): Promise<void> {
    await this.em.getConnection().execute(
      `UPDATE courier_profiles cp SET
         rating_avg = s.avg, rating_count = s.count
       FROM (
         SELECT ROUND(AVG(rating)::numeric, 1)::float AS avg, COUNT(*)::int AS count
         FROM courier_ratings WHERE courier_id = ?
       ) s
       WHERE cp.id = ?`,
      [courierId, courierId],
    )
  }

  /** Only the buyer of a delivered run handled by a platform courier may give feedback. */
  private async loadDeliveredForBuyer(deliveryId: string, buyerUserId: string): Promise<Delivery> {
    const delivery = await this.em.findOne(Delivery, { id: deliveryId }, {
      populate: ['order', 'order.buyer', 'courier', 'courier.user'],
    })
    if (!delivery) {
      throw new NotFoundException('Delivery not found')
    }
    if (delivery.order.buyer.id !== buyerUserId) {
      throw new ForbiddenException('Seul le client de la commande peut noter le livreur')
    }
    if (delivery.status !== DeliveryStatus.DELIVERED || !delivery.courier) {
      throw new BadRequestException('La livraison doit être terminée par un livreur')
    }
    return delivery
  }

  private async notify(userId: string, payload: { type: NotificationType, title: string, body: string, data: Record<string, unknown> }): Promise<void> {
    try {
      const user = await this.em.findOneOrFail(User, { id: userId })
      await this.notificationsService.send({
        user,
        ...payload,
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
        apps: ['courier'],
      })
    }
    catch (error) {
      this.logger.error(`Courier feedback notification failed (${payload.type})`, error instanceof Error ? error.stack : String(error))
    }
  }
}
