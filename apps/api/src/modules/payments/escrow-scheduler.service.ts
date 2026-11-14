import { EnsureRequestContext } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { SingleInstance } from '../db/cron-lock'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { Order, OrderStatus, PickupMode } from '../orders/entities/order.entity'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { escrowReleaseAt } from './escrow-release-policy'
import { Payment, PaymentStatus } from './payment.entity'
import { PaymentsService } from './payments.service'

const HOUR_MS = 60 * 60 * 1000

/**
 * Pays shops for the orders settled online, once the delay is over.
 *
 * The delay is the platform's (back-office setting) unless eBio set one on
 * the shop itself; zero pays at delivery. The hourly run covers every delay,
 * `releaseIfDue` covers the moments that can make an order due at once: its
 * delivery and the last of the two confirmations.
 */
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
  @SingleInstance()
  @EnsureRequestContext()
  async processEscrowReleases(): Promise<void> {
    // Read on every run: a delay changed in the back-office applies from the
    // next hour, to orders already delivered as well.
    const delays = await this.platformSettings.getEscrowRelease()
    const now = new Date()

    const payments = await this.em.find(Payment, {
      status: { $in: [PaymentStatus.CAPTURED, PaymentStatus.ESCROW] },
      order: { status: OrderStatus.DELIVERED, escrowReleasedAt: null },
    }, { populate: ['order', 'order.supplier'] })

    for (const payment of payments) {
      const order = payment.order
      const due = escrowReleaseAt(delays, {
        deliveredAt: order.deliveredAt ?? null,
        bothConfirmed: order.deliveryConfirmedByBuyer && order.deliveryConfirmedBySupplier,
        supplierHours: order.supplier.escrowReleaseHours,
        exportOrder: order.pickupMode === PickupMode.EXPORT,
      }, now)
      if (due > now) {
        continue
      }
      await this.release(payment)
    }

    await this.sendReminders(delays.heuresMaximum)
  }

  /**
   * Releases the order's money now if its delay is already over: a shop paid
   * at once, or both sides having confirmed with no delay after confirmation.
   * Never throws: the delivery or the confirmation that called it stands
   * whatever happens here, and the hourly run retries.
   */
  async releaseIfDue(orderId: string): Promise<void> {
    try {
      const payment = await this.em.findOne(Payment, {
        status: { $in: [PaymentStatus.CAPTURED, PaymentStatus.ESCROW] },
        order: { id: orderId, status: OrderStatus.DELIVERED, escrowReleasedAt: null },
      }, { populate: ['order', 'order.supplier'] })
      if (!payment) {
        return
      }
      const order = payment.order
      const delays = await this.platformSettings.getEscrowRelease()
      const due = escrowReleaseAt(delays, {
        deliveredAt: order.deliveredAt ?? null,
        bothConfirmed: order.deliveryConfirmedByBuyer && order.deliveryConfirmedBySupplier,
        supplierHours: order.supplier.escrowReleaseHours,
        exportOrder: order.pickupMode === PickupMode.EXPORT,
      })
      if (due.getTime() <= Date.now()) {
        await this.release(payment)
      }
    }
    catch (error) {
      this.logger.error(`Immediate escrow release failed for order ${orderId}`, error instanceof Error ? error.stack : String(error))
    }
  }

  private async release(payment: Payment): Promise<void> {
    try {
      await this.paymentsService.releaseEscrow(payment.id)
      this.logger.log(`Escrow released for order ${payment.order.orderNumber}`)
    }
    catch (error) {
      this.logger.error(`Failed to release escrow for payment ${payment.id}`, error instanceof Error ? error.stack : String(error))
    }
  }

  /**
   * Two reminders to confirm, four days and one day before the automatic
   * release, when the ceiling leaves room for them. Shops with their own
   * delay are left out: the reminder would announce the platform's.
   */
  private async sendReminders(maxHours: number): Promise<void> {
    const maxDays = Math.floor(maxHours / 24)
    const days = [...new Set([maxDays - 4, maxDays - 1])].filter(day => day >= 1)
    for (const day of days) {
      await this.sendReminderAtDay(day, maxDays)
    }
  }

  private async sendReminderAtDay(dayNumber: number, maxDays: number): Promise<void> {
    const millisSinceDelivery = dayNumber * 24 * HOUR_MS
    const windowStart = new Date(Date.now() - millisSinceDelivery - HOUR_MS)
    const windowEnd = new Date(Date.now() - millisSinceDelivery)

    const orders = await this.em.find(Order, {
      status: OrderStatus.DELIVERED,
      deliveredAt: { $gte: windowStart, $lt: windowEnd },
      escrowReleasedAt: null,
      supplier: { escrowReleaseHours: null },
      $or: [
        { deliveryConfirmedByBuyer: false },
        { deliveryConfirmedBySupplier: false },
      ],
    }, { populate: ['buyer', 'supplier', 'supplier.user'] })

    for (const order of orders) {
      const daysLeft = maxDays - dayNumber
      if (!order.deliveryConfirmedByBuyer) {
        await this.notificationsService.send({
          user: order.buyer,
          type: NotificationType.ESCROW_REMINDER,
          title: 'Confirmez votre livraison',
          body: `Veuillez confirmer la réception de la commande ${order.orderNumber}. Sans confirmation, les fonds seront libérés automatiquement dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}.`,
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
