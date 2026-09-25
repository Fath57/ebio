import { EnsureRequestContext } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { PlatformSettingsService } from '../settings/platform-settings.service'

interface AbandonedCart {
  cart_id: string
  user_id: string
  item_count: number
  total: number
  shop_name: string
  reminders: number
}

/**
 * Reminding people of what they left in their basket.
 *
 * A basket that has not moved for a few hours is not a decision, it is an
 * interruption — a phone that rang, a battery that died. One message says so;
 * a stream of them says something else, so the count is capped and set from
 * the back-office.
 */
@Injectable()
export class CartRemindersService {
  private readonly logger = new Logger(CartRemindersService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly notifications: NotificationsService,
    private readonly settings: PlatformSettingsService,
  ) {}

  /**
   * Every twenty minutes.
   *
   * The delay is counted in hours, so looking more often would only cost
   * queries without moving a single message earlier.
   */
  @Cron('0 */20 * * * *')
  // Outside a request the global EntityManager is refused; same trap as the
  // review invitations and the dispatch crons.
  @EnsureRequestContext()
  async remindAbandonedCarts(): Promise<void> {
    const [delayHours, maxReminders] = await Promise.all([
      this.settings.getCartReminderHours(),
      this.settings.getCartReminderCount(),
    ])

    if (maxReminders === 0) {
      return
    }

    const abandoned = await this.em.getConnection().execute<AbandonedCart[]>(
      `SELECT c.id AS cart_id,
              c.user_id,
              c.reminders,
              COUNT(ci.id)::int AS item_count,
              COALESCE(SUM(ci.unit_price * ci.quantity), 0)::int AS total,
              MIN(s.shop_name) AS shop_name
       FROM carts c
       JOIN cart_items ci ON ci.cart_id = c.id
       JOIN suppliers s ON s.id = ci.supplier_id
       WHERE c.reminders < ?
         -- The same delay separates the last change from the first reminder
         -- and each reminder from the one before: a single number to explain.
         AND COALESCE(c.reminded_at, c.updated_at) <= NOW() - (? * INTERVAL '1 hour')
       GROUP BY c.id, c.user_id, c.reminders
       ORDER BY c.updated_at
       LIMIT 200`,
      [maxReminders, delayHours],
    )

    if (abandoned.length === 0) {
      return
    }

    let sent = 0
    for (const cart of abandoned) {
      try {
        await this.notifications.send({
          user: { id: cart.user_id } as never,
          type: NotificationType.CART_REMINDER,
          title: cart.reminders === 0 ? 'Votre panier vous attend' : 'Toujours dans votre panier',
          body: cart.item_count === 1
            ? `Un article de ${cart.shop_name} vous attend — ${cart.total.toLocaleString('fr-FR')} FCFA.`
            : `${cart.item_count} articles vous attendent — ${cart.total.toLocaleString('fr-FR')} FCFA.`,
          data: { cartId: cart.cart_id },
          channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
          apps: ['client'],
        })

        await this.em.getConnection().execute(
          `UPDATE carts SET reminders = reminders + 1, reminded_at = NOW() WHERE id = ?`,
          [cart.cart_id],
        )
        sent += 1
      }
      catch (error) {
        // The counter did not move, so this basket comes back next pass.
        this.logger.error(`Relance de panier échouée pour ${cart.user_id} — ${error}`)
      }
    }

    this.logger.log(`Paniers abandonnés : ${sent}/${abandoned.length} relance(s) envoyée(s)`)
  }
}
