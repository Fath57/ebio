import { Buffer } from 'node:buffer'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, NotFoundException } from '@nestjs/common'
import { Session, User } from './auth.entity'
import { TrustedDevice } from './entities/trusted-device.entity'
import { signSessionToken } from './session-token'

/** 32 bytes: a bearer credential, so it is guessed rather than reasoned about. */
const SECRET_BYTES = 32

/** How long a session opened by a fingerprint lasts — the same as any other. */
const SESSION_DAYS = 30

export interface EnrolledDevice {
  id: string
  label: string
  createdAt: Date
  lastUsedAt: Date | null
  /** Handed over once, never again: afterwards only its hash is kept. */
  secret: string
}

export interface ListedDevice {
  id: string
  label: string
  createdAt: Date
  lastUsedAt: Date | null
  current: boolean
}

function hash(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

/**
 * Fingerprint sign-in, as a list of trusted phones.
 *
 * The secret is drawn here and not by the app: the device only has to keep it,
 * and a client that generates its own credential is a client we would have to
 * trust to do it well. Only its hash is stored, so the table is worth nothing
 * to whoever reads it.
 */
@Injectable()
export class BiometricService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Trusts this phone, and returns the secret it must keep.
   *
   * Enrolling the same device twice replaces its secret rather than adding a
   * row: reinstalling the app loses the keystore, and the person would
   * otherwise collect dead entries they cannot tell apart.
   */
  async enroll(userId: string, deviceId: string, label: string): Promise<EnrolledDevice> {
    const fork = this.em.fork()
    const secret = randomBytes(SECRET_BYTES).toString('hex')

    const existing = await fork.findOne(TrustedDevice, { user: { id: userId }, deviceId, revokedAt: null })
    const device = existing ?? fork.create(TrustedDevice, {
      user: fork.getReference(User, userId),
      deviceId,
      keyHash: hash(secret),
      label,
    })

    device.keyHash = hash(secret)
    device.label = label
    device.revokedAt = undefined
    await fork.flush()

    return {
      id: device.id,
      label: device.label,
      createdAt: device.createdAt,
      lastUsedAt: device.lastUsedAt ?? null,
      secret,
    }
  }

  /**
   * Opens a session for a device that proves it holds the secret.
   *
   * Returns null for every refusal, whatever the reason: saying which of the
   * device and the secret was wrong tells whoever is guessing where to aim.
   */
  async verify(deviceId: string, secret: string): Promise<{ accessToken: string, user: User } | null> {
    const fork = this.em.fork()
    const device = await fork.findOne(
      TrustedDevice,
      { deviceId, revokedAt: null },
      { populate: ['user'] },
    )
    if (!device) {
      return null
    }

    const presented = Buffer.from(hash(secret), 'hex')
    const stored = Buffer.from(device.keyHash, 'hex')
    // Same length by construction; the guard is against a malformed hash.
    if (presented.length !== stored.length || !timingSafeEqual(presented, stored)) {
      return null
    }

    const session = fork.create(Session, {
      user: device.user,
      token: randomBytes(SECRET_BYTES).toString('hex'),
      expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
    })

    device.lastUsedAt = new Date()
    device.user.lastLoginAt = new Date()
    await fork.flush()

    // Signed: a bare token is refused by the very next call.
    return { accessToken: signSessionToken(session.token), user: device.user }
  }

  async list(userId: string, currentDeviceId: string | null): Promise<ListedDevice[]> {
    const fork = this.em.fork()
    const devices = await fork.find(
      TrustedDevice,
      { user: { id: userId }, revokedAt: null },
      { orderBy: { createdAt: 'DESC' } },
    )

    return devices.map(device => ({
      id: device.id,
      label: device.label,
      createdAt: device.createdAt,
      lastUsedAt: device.lastUsedAt ?? null,
      current: currentDeviceId !== null && device.deviceId === currentDeviceId,
    }))
  }

  /** Revoking keeps the row: a device that was trusted is worth an audit. */
  async revoke(userId: string, deviceId: string): Promise<void> {
    const fork = this.em.fork()
    const device = await fork.findOne(TrustedDevice, { id: deviceId, user: { id: userId }, revokedAt: null })
    if (!device) {
      throw new NotFoundException('Appareil introuvable')
    }
    device.revokedAt = new Date()
    await fork.flush()
  }
}
