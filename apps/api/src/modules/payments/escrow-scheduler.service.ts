import { EnsureRequestContext } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { Order, OrderStatus } from '../orders/entities/order.entity'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { Payment, PaymentStatus } from './payment.entity'
import { PaymentsService } from './payments.service'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

@Injectable()
export class EscrowSchedulerService {
  private readonly logger = new Logger(EscrowSchedulerService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly paymentsService: PaymentsService,
    private readonly notificationsService: NotificationsService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  @EnsureRequestContext()
  async processEscrowReleases(): Promise<void> {
    // Read on every run: a delay changed in the back-office applies from the
    // next hour, to orders already delivered as well.
    const { heuresApresConfirmation, joursMaximum } = await this.platformSettings.getEscrowRelease()
    await this.releaseBothConfirmedOrders(heuresApresConfirmation * HOUR_MS)
    await this.autoReleaseExpiredOrders(joursMaximum * DAY_MS)
    await this.sendReminders(joursMaximum)
  }

  private async releaseBothConfirmedOrders(delayMs: number): Promise<void> {
    const cutoff = new Date(Date.now() - delayMs)

    const payments = await this.em.find(Payment, {
      status: { $in: [PaymentStatus.CAPTURED, PaymentStatus.ESCROW] },
      order: {
        status: OrderStatus.DELIVERED,
        deliveryConfirmedByBuyer: true,
        deliveryConfirmedBySupplier: true,
        deliveredAt: { $lt: cutoff },
        escrowReleasedAt: null,
      },
    }, { populate: ['order'] })

    for (const payment of payments) {
      try {
        await this.paymentsService.releaseEscrow(payment.id)
        this.logger.log(`Escrow released for order ${payment.order.orderNumber} (both parties confirmed + 48h)`)
      }
      catch (error) {
        this.logger.error(`Failed to release escrow for payment ${payment.id}`, error)
      }
    }
  }

  private async autoReleaseExpiredOrders(delayMs: number): Promise<void> {
    const cutoff = new Date(Date.now() - delayMs)

    const payments = await this.em.find(Payment, {
      status: { $in: [PaymentStatus.CAPTURED, PaymentStatus.ESCROW] },
      order: {
        status: OrderStatus.DELIVERED,
        deliveredAt: { $lt: cutoff },
        escrowReleasedAt: null,
      },
    }, { populate: ['order'] })

    for (const payment of payments) {
      try {
        await this.paymentsService.releaseEscrow(payment.id)
        this.logger.log(`Escrow auto-released for order ${payment.order.orderNumber} (7 days since delivery, no dispute)`)
      }
      catch (error) {
        this.logger.error(`Failed to auto-release escrow for payment ${payment.id}`, error)
      }
    }
  }

  /**
   * Two reminders to confirm, four days and one day before the automatic
   * release — the same moments as before with the default week, and still
   * meaningful when the week is shortened.
   */
  private async sendReminders(maxDays: number): Promise<void> {
    const days = [...new Set([maxDays - 4, maxDays - 1])].filter(day => day >= 1)
    for (const day of days) {
      await this.sendReminderAtDay(day * DAY_MS, day, maxDays)
    }
  }

  private async sendReminderAtDay(millisSinceDelivery: number, dayNumber: number, maxDays: number): Promise<void> {
    const windowStart = new Date(Date.now() - millisSinceDelivery - 60 * 60 * 1000)
    const windowEnd = new Date(Date.now() - millisSinceDelivery)

    const orders = await this.em.find(Order, {
      status: OrderStatus.DELIVERED,
      deliveredAt: { $gte: windowStart, $lt: windowEnd },
      escrowReleasedAt: null,
      $or: [
        { deliveryConfirmedByBuyer: false },
        { deliveryConfirmedBySupplier: false },
      ],
    }, { populate: ['buyer', 'supplier', 'supplier.user'] })

    for (const order of orders) {
      if (!order.deliveryConfirmedByBuyer) {
        await this.notificationsService.send({
          user: order.buyer,
          type: NotificationType.ESCROW_REMINDER,
          title: 'Confirmez votre livraison',
          body: `Veuillez confirmer la réception de la commande ${order.orderNumber}. Sans confirmation, les fonds seront libérés automatiquement dans ${maxDays - dayNumber} jour${maxDays - dayNumber > 1 ? 's' : ''}.`,
          data: { orderId: order.id, dayNumber },
          channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
        })
      }

      if (!order.deliveryConfirmedBySupplier) {
        await this.notificationsService.send({
          user: order.supplier.user,
          type: NotificationType.ESCROW_REMINDER,
          title: 'Confirmez la livraison',
          body: `Veuillez confirmer la livraison de la commande ${order.orderNumber}.`,
          data: { orderId: order.id, dayNumber },
          channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
        })
      }

      this.logger.debug(`Sent day-${dayNumber} escrow reminder for order ${order.orderNumber}`)
    }
  }
}
