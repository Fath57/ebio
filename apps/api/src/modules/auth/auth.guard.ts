import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { fromNodeHeaders } from 'better-auth/node'
import { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import { AuthService } from './auth.service'

export interface AuthenticatedRequest extends Request {
  session: LoggedInBetterAuthSession
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
      console.error(error)
      throw new UnauthorizedException()
    }
  }
}
