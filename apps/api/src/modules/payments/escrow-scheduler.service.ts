import { EnsureRequestContext } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { Order, OrderStatus } from '../orders/entities/order.entity'
import { Payment, PaymentStatus } from './payment.entity'
import { PaymentsService } from './payments.service'

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000
const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

@Injectable()
export class EscrowSchedulerService {
  private readonly logger = new Logger(EscrowSchedulerService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly paymentsService: PaymentsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  @EnsureRequestContext()
  async processEscrowReleases(): Promise<void> {
    await this.releaseBothConfirmedOrders()
    await this.autoReleaseExpiredOrders()
    await this.sendReminders()
  }

  private async releaseBothConfirmedOrders(): Promise<void> {
    const cutoff = new Date(Date.now() - FORTY_EIGHT_HOURS_MS)

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

  private async autoReleaseExpiredOrders(): Promise<void> {
    const cutoff = new Date(Date.now() - SEVEN_DAYS_MS)

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

  private async sendReminders(): Promise<void> {
    await this.sendReminderAtDay(THREE_DAYS_MS, 3)
    await this.sendReminderAtDay(SIX_DAYS_MS, 6)
  }

  private async sendReminderAtDay(millisSinceDelivery: number, dayNumber: number): Promise<void> {
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
          body: `Veuillez confirmer la réception de la commande ${order.orderNumber}. Sans confirmation, les fonds seront libérés automatiquement dans ${7 - dayNumber} jours.`,
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
