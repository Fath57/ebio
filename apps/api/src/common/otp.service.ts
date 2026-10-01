import { Buffer } from 'node:buffer'
import { randomInt, timingSafeEqual } from 'node:crypto'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { Verification } from '../modules/auth/auth.entity'
import { EmailService } from '../modules/email/email.service'
import { SmsService } from './sms.service'

const OTP_TTL_MINUTES = 5
const OTP_COOLDOWN_SECONDS = 60
const MAX_CODE_ATTEMPTS = 5

function isSameCode(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected)
  const actualBytes = Buffer.from(actual)
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes)
}

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

    const verificationId = await this.spendGuess(fork, `otp:${phone}`, code)
    if (!verificationId)
      return false

    await fork.nativeDelete(Verification, { id: verificationId })
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

    await this.emailService.sendTemplatedEmail({
      to: email,
      subject: 'eBio — Code de vérification',
      template: 'otp-code',
      data: { otpCode: code, userName: null, expiresInMinutes: OTP_TTL_MINUTES },
    })

    this.logger.debug(`[EMAIL-OTP] ${email} → ${code}`)

    return { success: true }
  }

  /**
   * A code sent to an address someone wants to start using.
   *
   * Kept apart from the sign-up code under its own identifier: a code asked
   * for while changing an address must not let anyone create an account, and
   * the other way round.
   */
  async sendEmailChangeOtp(email: string): Promise<{ success: boolean, error?: string }> {
    const fork = this.em.fork()

    const recent = await fork.findOne(Verification, {
      identifier: `email-change:${email}`,
      createdAt: { $gte: new Date(Date.now() - OTP_COOLDOWN_SECONDS * 1000) },
    })
    if (recent) {
      return { success: false, error: 'Veuillez patienter avant de renvoyer un code' }
    }

    await fork.nativeDelete(Verification, { identifier: `email-change:${email}` })

    const code = randomInt(100000, 999999).toString()
    fork.create(Verification, {
      identifier: `email-change:${email}`,
      value: code,
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
    })
    await fork.flush()

    await this.emailService.sendTemplatedEmail({
      to: email,
      subject: 'eBio — Confirmez votre nouvelle adresse',
      template: 'otp-code',
      data: { otpCode: code, userName: null, expiresInMinutes: OTP_TTL_MINUTES },
    })

    return { success: true }
  }

  async verifyEmailChangeOtp(email: string, code: string): Promise<boolean> {
    const fork = this.em.fork()
    const verificationId = await this.spendGuess(fork, `email-change:${email}`, code)
    if (!verificationId) {
      return false
    }
    await fork.nativeDelete(Verification, { id: verificationId })
    return true
  }

  async verifyEmailOtp(email: string, code: string): Promise<boolean> {
    const fork = this.em.fork()

    const verificationId = await this.spendGuess(fork, `otp:${email}`, code)
    if (!verificationId)
      return false

    await fork.nativeDelete(Verification, { id: verificationId })
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

    if (identifier.startsWith('+')) {
      await this.smsService.send(identifier, `eBio: votre code de réinitialisation est ${code}`)
    }
    else if (identifier.includes('@')) {
      await this.emailService.sendTemplatedEmail({
        to: identifier,
        subject: 'eBio — Code de réinitialisation',
        template: 'otp-code',
        data: { otpCode: code, userName: null, expiresInMinutes: OTP_TTL_MINUTES },
      })
    }

    this.logger.debug(`[RESET-OTP] ${identifier} → ${code}`)

    return { success: true }
  }

  async verifyPasswordResetOtp(identifier: string, code: string): Promise<boolean> {
    const fork = this.em.fork()

    const verificationId = await this.spendGuess(fork, `reset:${identifier}`, code)
    if (!verificationId)
      return false

    // Kept as a marker, consumed once the password is actually reset.
    await fork.nativeUpdate(Verification, { id: verificationId }, { identifier: `reset-verified:${identifier}` })
    return true
  }

  /**
   * Spends one guess on the live code for `identifier`, then compares.
   *
   * The guess is counted before the comparison, in a single UPDATE: parallel
   * requests queue on the row and share five guesses in all, not five each.
   * Six digits open to unlimited guesses for five minutes can be enumerated.
   * Returns the matching row's id, or null.
   */
  private async spendGuess(fork: EntityManager, identifier: string, code: string): Promise<string | null> {
    const rows = await fork.execute<Array<{ id: string, value: string }>>(
      `UPDATE verification SET attempts = attempts + 1, "updatedAt" = NOW()
       WHERE identifier = ? AND "expiresAt" >= NOW() AND attempts < ?
       RETURNING id, value`,
      [identifier, MAX_CODE_ATTEMPTS],
    )
    return rows.find(row => isSameCode(row.value, code))?.id ?? null
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
    if (!verification)
      return false
    await fork.nativeDelete(Verification, { id: verification.id })
    return true
  }

  async isResetVerified(identifier: string): Promise<boolean> {
    const fork = this.em.fork()

    const verification = await fork.findOne(Verification, {
      identifier: `reset-verified:${identifier}`,
      expiresAt: { $gte: new Date() },
    })

    if (!verification)
      return false

    // Consume the verification
    await fork.nativeDelete(Verification, { id: verification.id })

    return true
  }
}
