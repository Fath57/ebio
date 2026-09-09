import type { CanActivate, ExecutionContext } from '@nestjs/common'
import type { UserStatus } from './auth.entity'
import { ForbiddenException, HttpException, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { fromNodeHeaders } from 'better-auth/node'
import { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import { AuthService } from './auth.service'

export interface AuthenticatedRequest extends Request {
  session: LoggedInBetterAuthSession
}

/** Error codes the clients key on to sign the user out and explain why. */
export const ACCOUNT_BLOCKED_CODES = {
  SUSPENDED: 'ACCOUNT_SUSPENDED',
  BANNED: 'ACCOUNT_BANNED',
} as const

interface SessionUserStanding {
  status?: UserStatus
  statusReason?: string | null
  suspendedUntil?: string | Date | null
}

/**
 * A suspended (still within its end date) or banned account is refused on
 * every authenticated route. The fields ride on the Better Auth session, so
 * this costs no extra query; the admin also revokes sessions on the spot.
 */
export function assertAccountActive(user: SessionUserStanding | null | undefined): void {
  if (!user?.status || user.status === 'ACTIVE')
    return
  const until = user.suspendedUntil ? new Date(user.suspendedUntil) : null
  if (user.status === 'SUSPENDED' && until && until.getTime() <= Date.now())
    return
  const banned = user.status === 'BANNED'
  throw new ForbiddenException({
    statusCode: 403,
    code: banned ? ACCOUNT_BLOCKED_CODES.BANNED : ACCOUNT_BLOCKED_CODES.SUSPENDED,
    message: banned
      ? 'Votre compte a été bloqué.'
      : 'Votre compte est suspendu.',
    reason: user.statusReason ?? null,
    suspendedUntil: banned ? null : until?.toISOString() ?? null,
  })
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const request = context.switchToHttp().getRequest()
      // Try cookie-based session first (web clients)
      let session = await this.authService.api.getSession({
        headers: fromNodeHeaders(request.headers),
      })

      // Fallback: Bearer token (mobile clients)
      if (!session) {
        const authHeader = request.headers.authorization ?? request.headers.Authorization
        if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
          const token = authHeader.slice(7)
          // Create a fake cookie header so better-auth can resolve the session
          const fakeHeaders = new Headers()
          fakeHeaders.set('cookie', `better-auth.session_token=${token}`)
          session = await this.authService.api.getSession({ headers: fakeHeaders })
        }
      }

      request.session = session
      request.user = session?.user ?? null

      // A blocked account is refused even on public routes: the client must
      // learn about it as early as possible.
      assertAccountActive(session?.user as SessionUserStanding | undefined)

      const isPublic = this.reflector.get('PUBLIC', context.getHandler())
      if (isPublic)
        return true

      const isOptional = this.reflector.get('OPTIONAL', context.getHandler())
      if (isOptional && !session)
        return true

      if (!session)
        throw new UnauthorizedException()

      return true
    }
    catch (error) {
      // Our own verdicts (blocked account, missing session) pass through;
      // anything else is a session resolution failure.
      if (error instanceof HttpException)
        throw error
      console.error(error)
      throw new UnauthorizedException()
    }
  }
}
