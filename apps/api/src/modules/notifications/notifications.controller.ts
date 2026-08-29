import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { NotificationAudience } from './notifications.service'
import { EntityManager } from '@mikro-orm/postgresql'
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { config } from '../../config/env.config'
import { Session } from '../auth/auth.decorator'
import { User } from '../auth/auth.entity'
import { AuthGuard } from '../auth/auth.guard'
import { DeviceToken } from './device-token.entity'
import { NotificationChannel, NotificationType } from './notification.entity'
import { NOTIFICATION_AUDIENCES, NotificationsService } from './notifications.service'

const DEVICE_APPS: ReadonlySet<string> = new Set(['client', 'supplier', 'courier'])

function parseAudience(value?: string): NotificationAudience | undefined {
  return value && NOTIFICATION_AUDIENCES.has(value) ? value as NotificationAudience : undefined
}

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly em: EntityManager,
  ) {}

  @Post('register-token')
  async registerToken(
    @Session() session: LoggedInBetterAuthSession,
    @Body() body: { token: string, platform: string, app?: string },
  ) {
    const user = this.em.getReference(User, session.user.id)
    const app = body.app && DEVICE_APPS.has(body.app) ? body.app : undefined

    // Upsert: if token already exists, update user association
    const existing = await this.em.findOne(DeviceToken, { token: body.token })
    if (existing) {
      existing.user = user
      existing.platform = body.platform
      existing.app = app
    }
    else {
      this.em.create(DeviceToken, {
        user,
        token: body.token,
        platform: body.platform,
        app,
      })
    }

    await this.em.flush()
    return { registered: true }
  }

  @Delete('unregister-token')
  async unregisterToken(
    @Session() session: LoggedInBetterAuthSession,
    @Body() body: { token: string },
  ) {
    const existing = await this.em.findOne(DeviceToken, {
      token: body.token,
      user: { id: session.user.id },
    })
    if (existing) {
      this.em.remove(existing)
      await this.em.flush()
    }
    return { unregistered: true }
  }

  /** `audience` (buyer | supplier | courier) scopes the list to one app's types. */
  @Get('unread')
  async getUnread(
    @Session() session: LoggedInBetterAuthSession,
    @Query('audience') audience?: string,
  ) {
    const notifications = await this.notificationsService.getUnread(session.user.id, parseAudience(audience))
    return notifications.map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data,
      channel: n.channel,
      createdAt: n.createdAt.toISOString(),
    }))
  }

  @Get('')
  async getAll(
    @Session() session: LoggedInBetterAuthSession,
    @Query('audience') audience?: string,
  ) {
    const notifications = await this.notificationsService.getAll(session.user.id, parseAudience(audience))
    return notifications.map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data,
      channel: n.channel,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }))
  }

  @Get('count')
  async getUnreadCount(
    @Session() session: LoggedInBetterAuthSession,
    @Query('audience') audience?: string,
  ) {
    const notifications = await this.notificationsService.getUnread(session.user.id, parseAudience(audience))
    return { count: notifications.length }
  }

  @Patch(':id/read')
  async markAsRead(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') notificationId: string,
  ) {
    await this.notificationsService.markAsRead(session.user.id, notificationId)
    return { read: true }
  }

  @Patch('read-all')
  async markAllAsRead(@Session() session: LoggedInBetterAuthSession) {
    await this.notificationsService.markAllAsRead(session.user.id)
    return { read: true }
  }

  @Post('test')
  async sendTestNotification(@Session() session: LoggedInBetterAuthSession) {
    if (config.env === 'production') {
      return { error: 'Not available in production' }
    }

    const user = await this.em.findOneOrFail(User, session.user.id)

    await this.notificationsService.send({
      user,
      type: NotificationType.SYSTEM,
      title: '🔔 Test de notification',
      body: 'Ceci est une notification de test envoyée depuis l\'API eBio.',
      data: { test: true },
      channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
    })

    return { sent: true }
  }
}
