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
   * Enregistrer que les conditions ont été acceptées.
   *
   * Appelée par l'application juste après une inscription réussie, quel que
   * soit le chemin — téléphone, courriel ou Google. La case cochée à l'écran
   * ne quittait jamais le téléphone ; elle laisse désormais une trace datée.
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
