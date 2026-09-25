import type { AuthenticatedRequest } from '../auth/auth.guard'
import type { EmailChangeConfirm, EmailChangeRequest } from './contracts/user.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { BadRequestException, ConflictException, Controller, Get, Post, Put, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { OtpService } from '../../common/otp.service'
import { AuthGuard } from '../auth/auth.guard'
import { CaslAbilityFactory } from '../auth/casl/casl-ability.factory'
import { acceptTermsSchema, emailChangeConfirmSchema, emailChangeRequestSchema, updateUserSchema } from './contracts/user.contract'
import { UserMapper } from './users.mapper'
import { UsersService } from './users.service'

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly caslAbilityFactory: CaslAbilityFactory,
    private readonly otpService: OtpService,
  ) {}

  @Get('me')
  async getMe(@Req() req: AuthenticatedRequest) {
    const user = await this.usersService.findById(req.session.user.id)
    const permissions = await this.caslAbilityFactory.listGrantedPermissions(user)
    return UserMapper.toResponse(user, permissions)
  }

  @Put('me')
  async updateMe(
    @Req() req: AuthenticatedRequest,
    @TypedBody(updateUserSchema) body: z.infer<typeof updateUserSchema>,
  ) {
    const user = await this.usersService.update(req.session.user.id, body)
    return UserMapper.toResponse(user)
  }

  /**
   * Record that the terms were accepted.
   *
   * Called by the app right after a successful sign-up, whichever path was
   * taken — phone, email or Google. The box ticked on screen never left the
   * phone; it now leaves a dated record.
   */
  /**
   * Asks for a code at the address someone wants to start using.
   *
   * The code goes to the new address and nowhere else: that is the whole
   * proof. Refusing here when the address is taken saves them typing a code
   * for nothing.
   */
  @Post('me/email/request')
  async requestEmailChange(
    @Req() req: AuthenticatedRequest,
    @TypedBody(emailChangeRequestSchema) body: EmailChangeRequest,
  ) {
    const taken = await this.usersService.findByEmail(body.email)
    if (taken && taken.id !== req.session.user.id) {
      throw new ConflictException('Un compte existe déjà avec cet e-mail')
    }

    const result = await this.otpService.sendEmailChangeOtp(body.email)
    if (!result.success) {
      throw new BadRequestException(result.error)
    }
    return { message: 'Code envoyé à la nouvelle adresse' }
  }

  @Post('me/email/confirm')
  async confirmEmailChange(
    @Req() req: AuthenticatedRequest,
    @TypedBody(emailChangeConfirmSchema) body: EmailChangeConfirm,
  ) {
    const valid = await this.otpService.verifyEmailChangeOtp(body.email, body.code)
    if (!valid) {
      throw new UnauthorizedException('Code invalide ou expiré')
    }

    const user = await this.usersService.changeEmail(req.session.user.id, body.email)
    return { email: user.email, emailVerified: user.emailVerified }
  }

  @Post('me/terms')
  async acceptTerms(
    @Req() req: AuthenticatedRequest,
    @TypedBody(acceptTermsSchema) body: z.infer<typeof acceptTermsSchema>,
  ) {
    const user = await this.usersService.acceptTerms(req.session.user.id, body.depuis)
    return {
      termsAcceptedAt: user.termsAcceptedAt ?? null,
      termsVersion: user.termsVersion ?? null,
    }
  }
}
