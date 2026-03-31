import { randomInt } from 'node:crypto'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { Verification } from '../modules/auth/auth.entity'
import { EmailService } from '../modules/email/email.service'
import { SmsService } from './sms.service'

const OTP_TTL_MINUTES = 5
const OTP_COOLDOWN_SECONDS = 60

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly smsService: SmsService,
    private readonly emailService: EmailService,
  ) {}

  async sendOtp(phone: string): Promise<{ success: boolean, error?: string }> {
    const fork = this.em.fork()

    // Check cooldown — prevent spam
    const recent = await fork.findOne(Verification, {
      identifier: `otp:${phone}`,
      createdAt: { $gte: new Date(Date.now() - OTP_COOLDOWN_SECONDS * 1000) },
    })

    if (recent) {
      return { success: false, error: 'Veuillez patienter avant de renvoyer un code' }
    }

    // Remove old OTPs for this phone
    await fork.nativeDelete(Verification, { identifier: `otp:${phone}` })

    const code = randomInt(100000, 999999).toString()

    fork.create(Verification, {
      identifier: `otp:${phone}`,
      value: code,
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
    })

    await fork.flush()

    await this.smsService.send(phone, `eBio: votre code de vérification est ${code}`)
    this.logger.debug(`[OTP] ${phone} → ${code}`)

    return { success: true }
  }

  async verifyOtp(phone: string, code: string): Promise<boolean> {
    const fork = this.em.fork()

    const verification = await fork.findOne(Verification, {
      identifier: `otp:${phone}`,
      value: code,
      expiresAt: { $gte: new Date() },
    })

    if (!verification) return false

    // Consume the OTP
    await fork.nativeDelete(Verification, { id: verification.id })

    return true
  }

  // ─── Email OTP ─────────────────────────────────────────────────────────────

  async sendEmailOtp(email: string): Promise<{ success: boolean, error?: string }> {
    const fork = this.em.fork()

    const recent = await fork.findOne(Verification, {
      identifier: `otp:${email}`,
      createdAt: { $gte: new Date(Date.now() - OTP_COOLDOWN_SECONDS * 1000) },
    })

    if (recent) {
      return { success: false, error: 'Veuillez patienter avant de renvoyer un code' }
    }

    await fork.nativeDelete(Verification, { identifier: `otp:${email}` })

    const code = randomInt(100000, 999999).toString()

    fork.create(Verification, {
      identifier: `otp:${email}`,
      value: code,
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
    })

    await fork.flush()

    await this.emailService.sendEmail({
      to: email,
      subject: 'eBio — Code de vérification',
      content: `Votre code de vérification eBio est : ${code}. Il expire dans ${OTP_TTL_MINUTES} minutes.`,
    })

    this.logger.debug(`[EMAIL-OTP] ${email} → ${code}`)

    return { success: true }
  }

  async verifyEmailOtp(email: string, code: string): Promise<boolean> {
    const fork = this.em.fork()

    const verification = await fork.findOne(Verification, {
      identifier: `otp:${email}`,
      value: code,
      expiresAt: { $gte: new Date() },
    })

    if (!verification) return false

    await fork.nativeDelete(Verification, { id: verification.id })

    return true
  }

  // ─── Password reset OTP ───────────────────────────────────────────────────

  async sendPasswordResetOtp(identifier: string): Promise<{ success: boolean, error?: string }> {
    const fork = this.em.fork()

    const recent = await fork.findOne(Verification, {
      identifier: `reset:${identifier}`,
      createdAt: { $gte: new Date(Date.now() - OTP_COOLDOWN_SECONDS * 1000) },
    })

    if (recent) {
      return { success: false, error: 'Veuillez patienter avant de renvoyer un code' }
    }

    await fork.nativeDelete(Verification, { identifier: `reset:${identifier}` })

    const code = randomInt(100000, 999999).toString()

    fork.create(Verification, {
      identifier: `reset:${identifier}`,
      value: code,
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
    })

    await fork.flush()

    // If identifier looks like a phone, send SMS. Otherwise it's logged (email flow handled separately).
    if (identifier.startsWith('+')) {
      await this.smsService.send(identifier, `eBio: votre code de réinitialisation est ${code}`)
    }

    this.logger.debug(`[RESET-OTP] ${identifier} → ${code}`)

    return { success: true }
  }

  async verifyPasswordResetOtp(identifier: string, code: string): Promise<boolean> {
    const fork = this.em.fork()

    const verification = await fork.findOne(Verification, {
      identifier: `reset:${identifier}`,
      value: code,
      expiresAt: { $gte: new Date() },
    })

    if (!verification) return false

    // Mark as verified but don't delete — we'll delete after password is actually reset
    // Store a verified marker
    verification.identifier = `reset-verified:${identifier}`
    await fork.flush()

    return true
  }

  // ─── Registration token (issued after OTP verify for new users) ────────────

  async storeRegistrationToken(phone: string, token: string): Promise<void> {
    const fork = this.em.fork()
    await fork.nativeDelete(Verification, { identifier: `reg:${phone}` })
    fork.create(Verification, {
      identifier: `reg:${phone}`,
      value: token,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    })
    await fork.flush()
  }

  async consumeRegistrationToken(phone: string, token: string): Promise<boolean> {
    const fork = this.em.fork()
    const verification = await fork.findOne(Verification, {
      identifier: `reg:${phone}`,
      value: token,
      expiresAt: { $gte: new Date() },
    })
    if (!verification) return false
    await fork.nativeDelete(Verification, { id: verification.id })
    return true
  }

  async isResetVerified(identifier: string): Promise<boolean> {
    const fork = this.em.fork()

    const verification = await fork.findOne(Verification, {
      identifier: `reset-verified:${identifier}`,
      expiresAt: { $gte: new Date() },
    })

    if (!verification) return false

    // Consume the verification
    await fork.nativeDelete(Verification, { id: verification.id })

    return true
  }
}
