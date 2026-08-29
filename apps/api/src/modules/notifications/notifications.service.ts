import type { PushOptions } from './fcm.service'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { config } from '../../config/env.config'
import { User } from '../auth/auth.entity'
import { DeviceToken } from './device-token.entity'
import { FcmService } from './fcm.service'
import { Notification, NotificationChannel, NotificationType } from './notification.entity'

/**
 * Which app a notification belongs to. One eBio account can be buyer, supplier
 * and courier at once, and each app must only list its own notifications —
 * the type decides, since the sender already targets one role per type.
 */
export type NotificationAudience = 'buyer' | 'supplier' | 'courier'

export const NOTIFICATION_AUDIENCES: ReadonlySet<string> = new Set(['buyer', 'supplier', 'courier'])

const SHARED_TYPES: NotificationType[] = [
  NotificationType.SYSTEM,
  NotificationType.PROMOTIONAL,
]

const AUDIENCE_TYPES: Record<NotificationAudience, NotificationType[]> = {
  buyer: [
    ...SHARED_TYPES,
    NotificationType.ORDER_ACCEPTED,
    NotificationType.ORDER_REJECTED,
    NotificationType.ORDER_READY,
    NotificationType.ORDER_DELIVERED,
    NotificationType.ORDER_CANCELLED,
    NotificationType.PAYMENT_RECEIVED,
    NotificationType.DISPUTE_OPENED,
    NotificationType.DISPUTE_RESOLVED,
    NotificationType.STOCK_AVAILABLE,
    NotificationType.NEW_MESSAGE,
    NotificationType.ESCROW_REMINDER,
    NotificationType.DELIVERY_ASSIGNED,
    NotificationType.DELIVERY_PICKED_UP,
    NotificationType.DELIVERY_FAILED,
  ],
  supplier: [
    ...SHARED_TYPES,
    NotificationType.ORDER_PLACED,
    NotificationType.ORDER_CANCELLED,
    NotificationType.PAYMENT_RECEIVED,
    NotificationType.PAYMENT_RELEASED,
    NotificationType.DISPUTE_OPENED,
    NotificationType.DISPUTE_RESOLVED,
    NotificationType.SUPPLIER_VALIDATED,
    NotificationType.SUPPLIER_REJECTED,
    NotificationType.SUPPLIER_COMPLEMENT,
    NotificationType.STOCK_ALERT,
    NotificationType.NEW_MESSAGE,
    NotificationType.NEW_REVIEW,
    NotificationType.ESCROW_REMINDER,
    NotificationType.DELIVERY_ASSIGNED,
    NotificationType.DELIVERY_FAILED,
  ],
  courier: [
    ...SHARED_TYPES,
    NotificationType.DELIVERY_OFFER,
    NotificationType.DELIVERY_REASSIGNED,
    NotificationType.COURIER_VALIDATED,
    NotificationType.COURIER_REJECTED,
    NotificationType.COURIER_SUSPENDED,
    NotificationType.COURIER_EARNING,
    NotificationType.COURIER_PAYOUT,
    NotificationType.NEW_MESSAGE,
  ],
}

/** App that installs each audience's notifications. */
const AUDIENCE_APP: Record<NotificationAudience, string> = { buyer: 'client', supplier: 'supplier', courier: 'courier' }

/** Apps a notification type belongs to (a type can serve several audiences). */
function appsForType(type: NotificationType): Set<string> {
  const apps = new Set<string>()
  for (const audience of Object.keys(AUDIENCE_TYPES) as NotificationAudience[]) {
    if (AUDIENCE_TYPES[audience].includes(type)) {
      apps.add(AUDIENCE_APP[audience])
    }
  }
  return apps
}

interface SendNotificationOptions {
  user: User
  type: NotificationType
  title: string
  body: string
  data?: Record<string, unknown>
  channels: NotificationChannel[]
  /**
   * Explicit target apps for the push ('client' | 'supplier' | 'courier').
   * Overrides the per-type audience — needed when one type serves several
   * apps but this send is for one seat only (a chat message, say).
   */
  apps?: string[]
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly fcmService: FcmService,
  ) {}

  async send(options: SendNotificationOptions): Promise<void> {
    // One row per notification, whatever the channel fan-out: a PUSH+IN_APP
    // send used to create two rows, doubling the in-app list and the badge.
    const primaryChannel = options.channels.includes(NotificationChannel.IN_APP)
      ? NotificationChannel.IN_APP
      : options.channels[0] ?? NotificationChannel.IN_APP
    // Forked EM: send() is also called outside any request context (WebSocket
    // gateway, cron jobs), where the global EntityManager refuses writes.
    const em = this.em.fork()
    const notification = em.create(Notification, {
      user: em.getReference(User, options.user.id),
      type: options.type,
      title: options.title,
      body: options.body,
      data: options.data,
      channel: primaryChannel,
    })

    for (const channel of options.channels) {
      try {
        switch (channel) {
          case NotificationChannel.PUSH:
            await this.sendPush(options.user, options.title, options.body, options.type, options.data, options.apps)
            break
          case NotificationChannel.SMS:
            await this.sendSms(options.user, options.body)
            break
          case NotificationChannel.IN_APP:
            break
        }
        notification.sentAt = new Date()
      }
      catch (error) {
        this.logger.error(`Failed to send ${channel} notification to user ${options.user.id}`, error)
      }
    }

    await em.flush()
  }

  async getAll(userId: string, audience?: NotificationAudience): Promise<Notification[]> {
    return this.em.find(Notification, {
      user: { id: userId },
      ...(audience ? { type: { $in: AUDIENCE_TYPES[audience] } } : {}),
    }, {
      orderBy: { createdAt: 'DESC' },
      limit: 100,
    })
  }

  async getUnread(userId: string, audience?: NotificationAudience): Promise<Notification[]> {
    return this.em.find(Notification, {
      user: { id: userId },
      readAt: null,
      ...(audience ? { type: { $in: AUDIENCE_TYPES[audience] } } : {}),
    }, {
      orderBy: { createdAt: 'DESC' },
      limit: 50,
    })
  }

  async markAsRead(userId: string, notificationId: string): Promise<void> {
    const notification = await this.em.findOne(Notification, {
      id: notificationId,
      user: { id: userId },
    })
    if (notification) {
      notification.readAt = new Date()
      await this.em.flush()
    }
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.em.nativeUpdate(Notification, {
      user: { id: userId },
      readAt: null,
    }, { readAt: new Date() })
  }

  private async sendPush(
    user: User,
    title: string,
    body: string,
    type: NotificationType,
    data?: Record<string, unknown>,
    targetApps?: string[],
  ): Promise<void> {
    const em = this.em.fork()
    // One account may run the client, supplier and courier apps at once: only
    // the app(s) that display this type get the push — or the apps the caller
    // named explicitly. Legacy tokens without an app tag keep receiving
    // everything.
    const apps = targetApps ? new Set(targetApps) : appsForType(type)
    const allTokens = await em.find(DeviceToken, { user: { id: user.id } })
    const tokens = allTokens.filter(t => !t.app || apps.size === 0 || apps.has(t.app))
    if (tokens.length === 0) {
      this.logger.debug(`No device tokens for user ${user.id} and type ${type} — skipping push`)
      return
    }

    const stringData: Record<string, string> = { type }
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        // Objects must survive the FCM string-only data contract
        stringData[key] = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)
      }
    }

    const tokenStrings = tokens.map(t => t.token)
    await this.fcmService.sendToDevices(tokenStrings, title, body, stringData, this.pushOptionsFor(type, data))
  }

  /**
   * Time-sensitive pushes get a TTL and a collapse key so a stale or
   * rebroadcast offer replaces the pending one instead of stacking up.
   */
  private pushOptionsFor(type: NotificationType, data?: Record<string, unknown>): PushOptions | undefined {
    if (type === NotificationType.DELIVERY_OFFER) {
      return {
        ttlSeconds: 900,
        collapseKey: data?.deliveryId ? `offer-${data.deliveryId}` : undefined,
        channelId: 'ebio-offers',
      }
    }
    if (type === NotificationType.NEW_MESSAGE) {
      return {
        collapseKey: data?.conversationId ? `chat-${data.conversationId}` : undefined,
        channelId: 'ebio-messages',
      }
    }
    return undefined
  }

  private async sendSms(user: User, message: string): Promise<void> {
    if (!config.sms.apiKey || !user.phone) {
      this.logger.warn('SMS not configured or user has no phone — skipping SMS')
      return
    }
    // TODO: Implement SMS via Africa's Talking SDK
    this.logger.debug(`[SMS] → ${user.phone}: ${message}`)
  }
}
