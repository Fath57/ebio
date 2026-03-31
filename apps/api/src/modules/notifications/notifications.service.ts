import type { User } from '../auth/auth.entity'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { config } from '../../config/env.config'
import { DeviceToken } from './device-token.entity'
import { FcmService } from './fcm.service'
import { Notification, NotificationChannel, NotificationType } from './notification.entity'

interface SendNotificationOptions {
  user: User
  type: NotificationType
  title: string
  body: string
  data?: Record<string, unknown>
  channels: NotificationChannel[]
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly fcmService: FcmService,
  ) {}

  async send(options: SendNotificationOptions): Promise<void> {
    for (const channel of options.channels) {
      const notification = this.em.create(Notification, {
        user: options.user,
        type: options.type,
        title: options.title,
        body: options.body,
        data: options.data,
        channel,
      })

      try {
        switch (channel) {
          case NotificationChannel.PUSH:
            await this.sendPush(options.user, options.title, options.body, options.type, options.data)
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

    await this.em.flush()
  }

  async getAll(userId: string): Promise<Notification[]> {
    return this.em.find(Notification, { user: { id: userId } }, {
      orderBy: { createdAt: 'DESC' },
      limit: 100,
    })
  }

  async getUnread(userId: string): Promise<Notification[]> {
    return this.em.find(Notification, { user: { id: userId }, readAt: null }, {
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
  ): Promise<void> {
    // Fetch all device tokens for this user
    const tokens = await this.em.find(DeviceToken, { user: { id: user.id } })
    if (tokens.length === 0) {
      this.logger.debug(`No device tokens for user ${user.id} — skipping push`)
      return
    }

    const stringData: Record<string, string> = { type }
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        stringData[key] = String(value)
      }
    }

    const tokenStrings = tokens.map(t => t.token)
    await this.fcmService.sendToDevices(tokenStrings, title, body, stringData)
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
