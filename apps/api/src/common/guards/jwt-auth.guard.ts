import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { EntityManager } from '@mikro-orm/postgresql'
import { HttpException, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import * as jwt from 'jsonwebtoken'
import { config } from '../../config/env.config'
import { User } from '../../modules/auth/auth.entity'
import { assertAccountActive } from '../../modules/auth/auth.guard'

export interface JwtPayload {
  sub: string
  role: string
  iat: number
  exp: number
}

export interface JwtAuthenticatedRequest extends Request {
  user: JwtPayload
}

/**
 * Verifies a chat token and re-reads the account it names.
 *
 * The token lives seven days and carries the role it was minted with: the
 * account's standing and role come from the database instead, so a ban or a
 * role change applies on the next call rather than when the token expires.
 */
export async function verifyAccountToken(em: EntityManager, token: string): Promise<JwtPayload> {
  const payload = jwt.verify(token, config.jwt.secret) as JwtPayload
  const user = await em.findOne(User, { id: payload.sub })
  if (!user) {
    throw new UnauthorizedException('Unknown account')
  }
  assertAccountActive(user)
  return { ...payload, role: user.role }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly em: EntityManager,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.get<boolean>('isPublic', context.getHandler())
    if (isPublic)
      return true

    const request = context.switchToHttp().getRequest()
    const authHeader = request.headers.authorization as string | undefined

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header')
    }

    try {
      request.user = await verifyAccountToken(this.em, authHeader.substring(7))
      return true
    }
    catch (error) {
      // A blocked account keeps its own verdict: the apps key on its code.
      if (error instanceof HttpException)
        throw error
      throw new UnauthorizedException('Invalid or expired token')
    }
  }
}
