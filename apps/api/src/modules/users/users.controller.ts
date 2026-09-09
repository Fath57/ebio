import type { AuthenticatedRequest } from '../auth/auth.guard'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Get, Put, Req, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { AuthGuard } from '../auth/auth.guard'
import { CaslAbilityFactory } from '../auth/casl/casl-ability.factory'
import { updateUserSchema } from './contracts/user.contract'
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
}
