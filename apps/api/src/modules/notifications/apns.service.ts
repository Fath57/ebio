import type { ClientHttp2Session } from 'node:http2'
import type { PushOptions } from './fcm.service'
import { Buffer } from 'node:buffer'
import { createPrivateKey, sign } from 'node:crypto'
import { connect } from 'node:http2'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { config } from '../../config/env.config'

/** An APNs device token is 32 bytes in hex; FCM tokens look nothing like it. */
const APNS_TOKEN_PATTERN = /^[0-9a-f]{64}$/i

/** Apple accepts a provider token for one hour; renewing earlier avoids the edge. */
const PROVIDER_TOKEN_TTL_MS = 50 * 60 * 1000

/** The topic is the bundle id of the app that registered the token. */
const TOPIC_BY_APP: Record<string, string> = {
  client: 'com.ebio.mobile',
  supplier: 'com.ebio.supplier',
  courier: 'com.ebio.courier',
}

/** Reasons meaning the token will never work again: prune it. */
const DEAD_TOKEN_REASONS = new Set(['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'])

interface ApnsResponse {
  status: number
  reason?: string
}

/**
 * Sends to iOS devices over Apple's HTTP/2 API, without Firebase.
 *
 * The app registers the native token expo-notifications hands it, which on
 * iOS is an APNs token. FCM can only address those through the Firebase SDK
 * inside the app; talking to Apple directly keeps the app free of it.
 */
@Injectable()
export class ApnsService implements OnModuleDestroy {
  private readonly logger = new Logger(ApnsService.name)
  private session: ClientHttp2Session | null = null
  private providerToken: { value: string, issuedAt: number } | null = null

  constructor(private readonly em: EntityManager) {}

  static isApnsToken(token: string): boolean {
    return APNS_TOKEN_PATTERN.test(token)
  }

  get enabled(): boolean {
    return Boolean(config.apns.keyId && config.apns.teamId && config.apns.privateKey)
  }

  onModuleDestroy() {
    this.session?.close()
  }

  async send(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>,
    options?: PushOptions,
  ): Promise<boolean> {
    if (!this.enabled) {
      this.logger.warn('APNs credentials not configured, skipping iOS push')
      return false
    }

    const topic = await this.topicFor(token)
    const payload = JSON.stringify({
      aps: {
        alert: { title, body },
        // Bundled sounds keep their file name on iOS (`ebio_order.wav`).
        sound: options?.sound ?? 'default',
      },
      // expo-notifications reads a remote notification's data from `body`.
      body: data ?? {},
    })

    const headers: Record<string, string> = {
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      'authorization': `bearer ${this.getProviderToken()}`,
      'apns-topic': topic,
      'apns-push-type': 'alert',
      'apns-priority': '10',
    }
    if (options?.ttlSeconds !== undefined) {
      headers['apns-expiration'] = String(Math.floor(Date.now() / 1000) + options.ttlSeconds)
    }
    if (options?.collapseKey) {
      headers['apns-collapse-id'] = options.collapseKey.slice(0, 64)
    }

    try {
      const response = await this.request(headers, payload)
      if (response.status === 200) {
        return true
      }
      if (response.reason && DEAD_TOKEN_REASONS.has(response.reason)) {
        this.logger.warn(`Stale APNs token pruned (${response.reason}): ${token.slice(0, 12)}...`)
        await this.em.getConnection()
          .execute(`DELETE FROM device_tokens WHERE token = ?`, [token])
          .catch(() => this.logger.warn('Token pruning failed'))
      }
      else {
        this.logger.error(`APNs push failed (${response.status} ${response.reason ?? ''}) → ${token.slice(0, 12)}...`)
      }
      return false
    }
    catch (error) {
      this.logger.error(`APNs push failed → ${token.slice(0, 12)}...`, error)
      return false
    }
  }

  private async topicFor(token: string): Promise<string> {
    const rows = await this.em.getConnection().execute<Array<{ app: string | null }>>(
      `SELECT app FROM device_tokens WHERE token = ? LIMIT 1`,
      [token],
    )
    return TOPIC_BY_APP[rows[0]?.app ?? 'client'] ?? TOPIC_BY_APP.client!
  }

  /** ES256 JWT signed with the .p8 key, shared by every request for 50 minutes. */
  private getProviderToken(): string {
    const now = Date.now()
    if (this.providerToken && now - this.providerToken.issuedAt < PROVIDER_TOKEN_TTL_MS) {
      return this.providerToken.value
    }

    const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url')
    const unsigned = `${encode({ alg: 'ES256', kid: config.apns.keyId })}.${encode({ iss: config.apns.teamId, iat: Math.floor(now / 1000) })}`
    const signature = sign('sha256', Buffer.from(unsigned), {
      key: createPrivateKey(config.apns.privateKey!),
      // JWS wants the raw r||s pair, not the DER encoding Node defaults to.
      dsaEncoding: 'ieee-p1363',
    }).toString('base64url')

    this.providerToken = { value: `${unsigned}.${signature}`, issuedAt: now }
    return this.providerToken.value
  }

  /** One long-lived HTTP/2 connection, reopened when Apple or the network drops it. */
  private getSession(): ClientHttp2Session {
    if (this.session && !this.session.closed && !this.session.destroyed) {
      return this.session
    }
    const host = config.apns.production ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com'
    const session = connect(host)
    session.on('error', (error) => {
      this.logger.warn(`APNs connection error: ${error.message}`)
    })
    session.on('close', () => {
      if (this.session === session) {
        this.session = null
      }
    })
    // Idle connections must not keep the process alive on shutdown.
    session.unref()
    this.session = session
    return session
  }

  private request(headers: Record<string, string>, payload: string): Promise<ApnsResponse> {
    return new Promise((resolve, reject) => {
      const stream = this.getSession().request(headers)
      let status = 0
      let raw = ''
      stream.setEncoding('utf8')
      stream.setTimeout(10_000, () => {
        stream.close()
        reject(new Error('APNs request timed out'))
      })
      stream.on('response', (responseHeaders) => {
        status = Number(responseHeaders[':status'] ?? 0)
      })
      stream.on('data', (chunk: string) => {
        raw += chunk
      })
      stream.on('end', () => {
        let reason: string | undefined
        if (raw) {
          try {
            reason = (JSON.parse(raw) as { reason?: string }).reason
          }
          catch {
            reason = raw
          }
        }
        resolve({ status, reason })
      })
      stream.on('error', reject)
      stream.end(payload)
    })
  }
}
