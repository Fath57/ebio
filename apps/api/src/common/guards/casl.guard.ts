import type { CanActivate, ExecutionContext } from '@nestjs/common'
import type { Actions, Subjects } from '../../modules/auth/casl/casl-ability.factory'
import { EntityManager } from '@mikro-orm/postgresql'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { User } from '../../modules/auth/auth.entity'
import { CaslAbilityFactory } from '../../modules/auth/casl/casl-ability.factory'

export interface RequiredPermission {
  action: Actions
  subject: Subjects
}

export const CHECK_PERMISSIONS_KEY = 'check_permissions'

@Injectable()
export class CaslGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly caslAbilityFactory: CaslAbilityFactory,
    private readonly em: EntityManager,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.get<RequiredPermission[]>(
      CHECK_PERMISSIONS_KEY,
      context.getHandler(),
    ) ?? this.reflector.get<RequiredPermission[]>(
      CHECK_PERMISSIONS_KEY,
      context.getClass(),
    )

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true
    }

    const request = context.switchToHttp().getRequest()
    // Support both JWT auth (user.sub) and Better Auth (user.id) patterns
    const userId = request.user?.sub ?? request.user?.id ?? request.session?.user?.id

    if (!userId) {
      throw new ForbiddenException('Acces refuse')
    }

    const user = await this.em.findOne(User, { id: userId }, { populate: ['userRole'] })
    if (!user) {
      throw new ForbiddenException('Utilisateur introuvable')
    }

    const ability = await this.caslAbilityFactory.createForUser(user)

    for (const permission of requiredPermissions) {
      if (!ability.can(permission.action, permission.subject)) {
        throw new ForbiddenException(
          `Permission refusee: ${permission.action} ${permission.subject}`,
        )
      }
    }

    return true
  }
}
