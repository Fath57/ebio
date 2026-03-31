import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import * as jwt from 'jsonwebtoken'
import { config } from '../../config/env.config'

export interface JwtPayload {
  sub: string
  role: string
  iat: number
  exp: number
}

export interface JwtAuthenticatedRequest extends Request {
  user: JwtPayload
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.get<boolean>('isPublic', context.getHandler())
    if (isPublic)
      return true

    const request = context.switchToHttp().getRequest()
    const authHeader = request.headers.authorization as string | undefined

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header')
    }

    const token = authHeader.substring(7)

    try {
      const payload = jwt.verify(token, config.jwt.secret) as JwtPayload
      request.user = payload
      return true
    }
    catch {
      throw new UnauthorizedException('Invalid or expired token')
    }
  }
}
