import type { Message } from 'firebase-admin/messaging'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import * as admin from 'firebase-admin'
import { config } from '../../config/env.config'

/** Per-message tuning for time-sensitive or collapsible pushes. */
export interface PushOptions {
  /** Drop the message if undelivered after this delay (offers go stale). */
  ttlSeconds?: number
  /** Later pushes with the same key replace the pending one in the tray. */
  collapseKey?: string
  /** Android notification channel; defaults to 'ebio-default'. */
  channelId?: string
}

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name)
  private initialized = false

  constructor(private readonly em: EntityManager) {}

  onModuleInit() {
    if (!config.fcm.projectId || !config.fcm.clientEmail || !config.fcm.privateKey) {
      this.logger.warn('Firebase credentials not configured — push notifications disabled')
      return
    }

    // HMR / multi-init guard: initializeApp throws app/duplicate-app on a
    // second call, which used to silently disable push for the process.
    if (admin.apps.length > 0) {
      this.initialized = true
      return
    }

    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: config.fcm.projectId,
          clientEmail: config.fcm.clientEmail,
          privateKey: config.fcm.privateKey,
        }),
      })
      this.initialized = true
      this.logger.log('Firebase Admin SDK initialized')
    }
    catch (error) {
      this.logger.error(`Failed to initialize Firebase Admin SDK: ${(error as Error).message ?? error}`)
    }
  }

  async sendToDevice(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>,
    options?: PushOptions,
  ): Promise<boolean> {
    if (!this.initialized) {
      this.logger.warn('FCM not initialized — skipping push')
      return false
    }

    const message: Message = {
      token,
      notification: { title, body },
      data: data ?? {},
      android: {
        priority: 'high',
        ...(options?.ttlSeconds !== undefined ? { ttl: options.ttlSeconds * 1000 } : {}),
        ...(options?.collapseKey ? { collapseKey: options.collapseKey } : {}),
        notification: {
          sound: 'default',
          channelId: options?.channelId ?? 'ebio-default',
          ...(options?.collapseKey ? { tag: options.collapseKey } : {}),
        },
      },
      apns: {
        headers: {
          'apns-priority': '10',
          ...(options?.collapseKey ? { 'apns-collapse-id': options.collapseKey } : {}),
        },
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
    }

    try {
      const messageId = await admin.messaging().send(message)
      this.logger.debug(`Push sent: ${messageId} → ${token.slice(0, 20)}...`)
      return true
    }
    catch (error: unknown) {
      const fcmError = error as { code?: string }
      if (fcmError.code === 'messaging/registration-token-not-registered'
        || fcmError.code === 'messaging/invalid-registration-token'
        // Token minted by another Firebase project (e.g. after the app split):
        // it will never work with these credentials, prune it too.
        || fcmError.code === 'messaging/mismatched-credential') {
        // Each reinstall registers a new token; the dead ones would deliver
        // duplicates forever if left behind.
        this.logger.warn(`Stale token pruned: ${token.slice(0, 20)}...`)
        await this.em.getConnection()
          .execute(`DELETE FROM device_tokens WHERE token = ?`, [token])
          .catch(() => this.logger.warn('Token pruning failed'))
      }
      else {
        this.logger.error(`Push failed → ${token.slice(0, 20)}...`, error)
      }
      return false
    }
  }

  async sendToDevices(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
    options?: PushOptions,
  ): Promise<{ success: number, failure: number }> {
    if (!this.initialized || tokens.length === 0) {
      return { success: 0, failure: 0 }
    }

    const results = await Promise.allSettled(
      tokens.map(token => this.sendToDevice(token, title, body, data, options)),
    )

    let success = 0
    let failure = 0
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        success++
      }
      else {
        failure++
      }
    }

    return { success, failure }
  }
}
