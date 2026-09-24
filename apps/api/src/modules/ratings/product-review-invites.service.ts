import { EnsureRequestContext } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { PlatformSettingsService } from '../settings/platform-settings.service'

/**
 * Une ligne de commande livrée qui attend encore un avis.
 *
 * Écrit en SQL parce que la question porte sur une absence — « les commandes
 * dont au moins un article n'a pas d'avis » — et qu'un `NOT EXISTS` le dit
 * mieux qu'un aller-retour d'entités.
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
   * Inviter l'acheteur à donner son avis, un moment après la livraison.
   *
   * Demander au moment où on pose le colis n'a pas de sens : personne n'a
   * encore ouvert le sac, et l'avis porterait sur l'emballage. On attend donc,
   * et on relance — un nombre de fois borné, parce que ne pas répondre est
   * aussi une réponse.
   *
   * Toutes les dix minutes : l'exactitude à la minute n'a aucun intérêt ici,
   * et une requête large qui tourne sans cesse coûterait plus qu'elle ne rend.
   */
  @Cron('0 */10 * * * *')
  // Hors requête, l'EntityManager global est refusé : le décorateur ouvre le
  // contexte que MikroORM exige. Même piège que les crons de diffusion.
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
        // Une invitation perdue n'est pas une raison d'abandonner les autres ;
        // le compteur n'ayant pas bougé, celle-ci repassera au prochain tour.
        this.logger.error(`Invitation d'avis échouée pour la commande ${order.order_number} — ${error}`)
      }
    }

    // Le nombre réellement parti, pas le nombre de candidates : la première
    // version annonçait huit envois alors que les huit avaient échoué.
    this.logger.log(`Avis produit : ${sent}/${pending.length} invitation(s) envoyée(s)`)
  }
}
