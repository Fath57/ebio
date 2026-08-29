import type { AuthenticatedRequest } from './auth.guard'
import { randomUUID } from 'node:crypto'
import { TypedBody } from '@lonestone/nzoth/server'
import { BadRequestException, Controller, Get, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import * as jwt from 'jsonwebtoken'
import { z } from 'zod'
import { OtpService } from '../../common/otp.service'
import { config } from '../../config/env.config'
import { AuthGuard } from './auth.guard'
import { otpRequestSchema, otpVerifySchema } from './contracts/auth.contract'
import { OtpAuthService } from './otp-auth.service'

const passwordResetRequestSchema = z.object({
  identifier: z.string().min(1),
})

const passwordResetVerifySchema = z.object({
  identifier: z.string().min(1),
  code: z.string().length(6),
})

const passwordResetSchema = z.object({
  identifier: z.string().min(1),
  newPassword: z.string().min(8),
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
})

const registerWithTokenSchema = z.object({
  phone: z.string().regex(/^\+229\d{10}$/),
  registrationToken: z.string().uuid(),
  name: z.string().min(2).max(100),
  password: z.string().min(8),
})

const emailOtpRequestSchema = z.object({
  email: z.string().email(),
})

const emailOtpVerifySchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  name: z.string().min(2).max(100),
  password: z.string().min(8),
})

@Controller('otp-auth')
export class OtpAuthController {
  constructor(
    private readonly otpService: OtpService,
    private readonly otpAuthService: OtpAuthService,
  ) {}

  // ─── Session (Bearer-compatible) ─────────────────────────────────────────────

  @Get('session')
  @UseGuards(AuthGuard)
  async getSession(@Req() req: AuthenticatedRequest) {
    const user = req.session?.user
    if (!user) {
      return { user: null }
    }
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone ?? null,
        image: user.image ?? null,
      },
    }
  }

  // ─── Chat token (JWT pour le REST chat + le socket Socket.IO) ─────────────────
  // Le module chat est protégé par JwtAuthGuard / un gateway qui vérifient un JWT
  // signé avec JWT_SECRET. On émet ce JWT à partir de la session Better Auth.
  @Get('chat-token')
  @UseGuards(AuthGuard)
  async getChatToken(@Req() req: AuthenticatedRequest): Promise<{ token: string }> {
    const user = req.session?.user
    if (!user) {
      throw new UnauthorizedException()
    }
    const token = jwt.sign(
      { sub: user.id, role: (user as { role?: string }).role ?? 'BUYER' },
      config.jwt.secret,
      { expiresIn: '7d' },
    )
    return { token }
  }

  // ─── Phone + password login (no OTP) ─────────────────────────────────────────

  @Post('login')
  async loginWithPhone(
    @TypedBody(z.object({
      phone: z.string(),
      password: z.string().min(1),
    })) body: { phone: string, password: string },
  ) {
    const result = await this.otpAuthService.loginWithPhone(body.phone, body.password)
    if (result === 'wrong_password') {
      throw new UnauthorizedException('Téléphone ou mot de passe incorrect')
    }
    if (!result) {
      throw new UnauthorizedException('Téléphone ou mot de passe incorrect')
    }
    return result
  }

  // ─── Phone OTP Request ──────────────────────────────────────────────────────

  @Post('request')
  async requestOtp(
    @TypedBody(otpRequestSchema) body: z.infer<typeof otpRequestSchema>,
  ) {
    const result = await this.otpService.sendOtp(body.phone)
    if (!result.success) {
      throw new BadRequestException(result.error)
    }
    return { message: 'Code envoyé' }
  }

  // ─── Phone OTP Verify (login existing user) ────────────────────────────────

  @Post('verify')
  async verifyOtp(
    @TypedBody(otpVerifySchema) body: z.infer<typeof otpVerifySchema>,
  ) {
    const valid = await this.otpService.verifyOtp(body.phone, body.code)
    if (!valid) {
      throw new UnauthorizedException('Code invalide ou expiré')
    }

    const result = await this.otpAuthService.loginWithPhone(body.phone)
    if (!result) {
      // User does not exist — issue a short-lived registration token so the
      // client can collect the name and call /register without a second OTP
      const registrationToken = randomUUID()
      await this.otpService.storeRegistrationToken(body.phone, registrationToken)
      return { needsRegistration: true, registrationToken }
    }

    return result
  }

  // ─── Phone OTP Register (new user, after verify returned registrationToken) ─

  @Post('register')
  async registerWithToken(
    @TypedBody(registerWithTokenSchema) body: z.infer<typeof registerWithTokenSchema>,
  ) {
    const valid = await this.otpService.consumeRegistrationToken(body.phone, body.registrationToken)
    if (!valid) {
      throw new UnauthorizedException('Token invalide ou expiré')
    }

    const existing = await this.otpAuthService.findByPhone(body.phone)
    if (existing) {
      throw new BadRequestException('Un compte existe déjà avec ce numéro')
    }

    return this.otpAuthService.registerWithPhone(body.phone, body.name, body.password)
  }

  // ─── Email OTP (for email registration) ─────────────────────────────────────

  @Post('email/request')
  async requestEmailOtp(
    @TypedBody(emailOtpRequestSchema) body: z.infer<typeof emailOtpRequestSchema>,
  ) {
    const existing = await this.otpAuthService.findByEmail(body.email)
    if (existing) {
      throw new BadRequestException('Un compte existe déjà avec cet e-mail')
    }

    const result = await this.otpService.sendEmailOtp(body.email)
    if (!result.success) {
      throw new BadRequestException(result.error)
    }
    return { message: 'Code envoyé' }
  }

  @Post('email/register')
  async registerWithEmail(
    @TypedBody(emailOtpVerifySchema) body: z.infer<typeof emailOtpVerifySchema>,
  ) {
    const valid = await this.otpService.verifyEmailOtp(body.email, body.code)
    if (!valid) {
      throw new UnauthorizedException('Code invalide ou expiré')
    }

    const existing = await this.otpAuthService.findByEmail(body.email)
    if (existing) {
      throw new BadRequestException('Un compte existe déjà avec cet e-mail')
    }

    return this.otpAuthService.registerWithEmail(body.email, body.name, body.password)
  }

  // ─── Password Reset via OTP ─────────────────────────────────────────────────

  @Post('password-reset/request')
  async requestPasswordReset(
    @TypedBody(passwordResetRequestSchema) body: z.infer<typeof passwordResetRequestSchema>,
  ) {
    const user = await this.otpAuthService.findByPhoneOrEmail(body.identifier)
    if (!user) {
      // Don't reveal whether the account exists
      return { message: 'Si un compte existe, un code a été envoyé' }
    }

    const isEmail = body.identifier.includes('@')
    const target = isEmail ? body.identifier : (body.identifier.startsWith('+') ? body.identifier : user.phone)
    if (!target) {
      throw new BadRequestException('Aucun identifiant de contact associé au compte')
    }

    const result = await this.otpService.sendPasswordResetOtp(target)
    if (!result.success) {
      throw new BadRequestException(result.error)
    }

    return { message: 'Code envoyé' }
  }

  @Post('password-reset/verify')
  async verifyPasswordReset(
    @TypedBody(passwordResetVerifySchema) body: z.infer<typeof passwordResetVerifySchema>,
  ) {
    const valid = await this.otpService.verifyPasswordResetOtp(body.identifier, body.code)
    if (!valid) {
      throw new UnauthorizedException('Code invalide ou expiré')
    }

    return { verified: true }
  }

  /** Logged-in password change (Bearer-compatible, unlike Better Auth's route). */
  @Post('change-password')
  @UseGuards(AuthGuard)
  async changePassword(
    @Req() req: AuthenticatedRequest,
    @TypedBody(changePasswordSchema) body: z.infer<typeof changePasswordSchema>,
  ) {
    const userId = req.session?.user?.id
    if (!userId) {
      throw new UnauthorizedException()
    }
    await this.otpAuthService.changePassword(userId, body.currentPassword, body.newPassword)
    return { message: 'Mot de passe modifié' }
  }

  @Post('password-reset/reset')
  async resetPassword(
    @TypedBody(passwordResetSchema) body: z.infer<typeof passwordResetSchema>,
  ) {
    const verified = await this.otpService.isResetVerified(body.identifier)
    if (!verified) {
      throw new UnauthorizedException('Vérification requise')
    }

    await this.otpAuthService.resetPassword(body.identifier, body.newPassword)

    return { message: 'Mot de passe réinitialisé' }
  }
}
