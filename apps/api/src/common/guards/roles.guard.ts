import type { CanActivate, ExecutionContext } from '@nestjs/common'
import type { JwtAuthenticatedRequest } from './jwt-auth.guard'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<string[]>('roles', context.getHandler())
      ?? this.reflector.get<string[]>('roles', context.getClass())

    if (!requiredRoles || requiredRoles.length === 0)
      return true

    const request = context.switchToHttp().getRequest<JwtAuthenticatedRequest>()
    const userRole = request.user?.role

    if (!userRole || !requiredRoles.includes(userRole)) {
      throw new ForbiddenException('Insufficient permissions')
    }

    return true
  }
}
