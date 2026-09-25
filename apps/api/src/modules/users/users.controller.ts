import type { AuthenticatedRequest } from '../auth/auth.guard'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Get, Post, Put, Req, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { AuthGuard } from '../auth/auth.guard'
import { CaslAbilityFactory } from '../auth/casl/casl-ability.factory'
import { acceptTermsSchema, updateUserSchema } from './contracts/user.contract'
import { UserMapper } from './users.mapper'
import { UsersService } from './users.service'

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly caslAbilityFactory: CaslAbilityFactory,
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
