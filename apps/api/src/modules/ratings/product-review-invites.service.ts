import { EnsureRequestContext } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { PlatformSettingsService } from '../settings/platform-settings.service'

/**
 * A delivered order still waiting on a review.
 *
 * Written in SQL because the question is about an absence — "orders where at
 * least one item has no review" — and a `NOT EXISTS` says it better than a
 * round trip through entities.
 */
interface PendingOrder {
  id: string
  buyer_id: string
  order_number: string
  shop_name: string
  invites_sent: number
}

@Injectable()
export class ProductReviewInvitesService {
  private readonly logger = new Logger(ProductReviewInvitesService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly notifications: NotificationsService,
    private readonly settings: PlatformSettingsService,
  ) {}

  /**
   * Invite the buyer to review, a while after the delivery.
   *
   * Asking as the parcel is set down makes no sense: nobody has opened the bag
   * yet, and the review would be about the packaging. So we wait, and we
   * remind — a bounded number of times, because not answering is an answer
   * too.
   *
   * Every ten minutes: minute-level accuracy is worth nothing here, and a
   * broad query running constantly would cost more than it returns.
   */
  @Cron('0 */10 * * * *')
  // Outside a request the global EntityManager is refused: the decorator
  // opens the context MikroORM demands. Same trap as the dispatch crons.
  @EnsureRequestContext()
  async inviteForDeliveredOrders(): Promise<void> {
    const [delayHours, maxInvites] = await Promise.all([
      this.settings.getProductReviewDelayHours(),
      this.settings.getProductReviewMaxInvites(),
    ])

    const pending = await this.em.getConnection().execute<PendingOrder[]>(
      `SELECT o.id, o.buyer_id, o.order_number, s.shop_name, o.review_invites_sent AS invites_sent
       FROM orders o
       JOIN suppliers s ON s.id = o.supplier_id
       WHERE o.status = 'DELIVERED'
         AND o.delivered_at IS NOT NULL
         AND o.review_invites_sent < ?
         -- Le même délai sépare la livraison de la première invitation et
         -- chaque relance de la précédente : un seul réglage à comprendre.
         AND COALESCE(o.review_invite_last_sent_at, o.delivered_at) <= NOW() - (? * INTERVAL '1 hour')
         -- Il reste quelque chose à noter : sans cela on relancerait quelqu'un
         -- qui a déjà tout dit.
         AND EXISTS (
           SELECT 1 FROM order_items oi
           WHERE oi.order_id = o.id
             AND NOT EXISTS (
               SELECT 1 FROM product_reviews pr WHERE pr.order_item_id = oi.id
             )
         )
       ORDER BY o.delivered_at
       LIMIT 200`,
      [maxInvites, delayHours],
    )

    if (pending.length === 0) {
      return
    }

    let sent = 0
    for (const order of pending) {
      try {
        await this.notifications.send({
          user: { id: order.buyer_id } as never,
          type: NotificationType.PRODUCT_REVIEW_INVITE,
          title: order.invites_sent === 0 ? 'Votre avis sur vos produits' : 'Vous n\'avez pas encore donné votre avis',
          body: `Qu'avez-vous pensé de ce que vous avez reçu de ${order.shop_name} ?`,
          data: { orderId: order.id, orderNumber: order.order_number },
          channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
          apps: ['client'],
        })

        await this.em.getConnection().execute(
          `UPDATE orders
           SET review_invites_sent = review_invites_sent + 1,
               review_invite_last_sent_at = NOW()
           WHERE id = ?`,
          [order.id],
        )
        sent += 1
      }
      catch (error) {
        // One lost invitation is no reason to drop the others; since the
        // counter did not move, this one comes back on the next pass.
        this.logger.error(`Invitation d'avis échouée pour la commande ${order.order_number} — ${error}`)
      }
    }

    // What actually went out, not how many were candidates: the first version
    // announced eight sends when all eight had failed.
    this.logger.log(`Avis produit : ${sent}/${pending.length} invitation(s) envoyée(s)`)
  }
}
