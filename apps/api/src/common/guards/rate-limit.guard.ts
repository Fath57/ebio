import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

const rateLimitStore = new Map<string, { count: number, resetAt: number }>()

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const limit = this.reflector.get<number>('rateLimit', context.getHandler()) ?? 10
    const windowMs = this.reflector.get<number>('rateLimitWindow', context.getHandler()) ?? 600_000

    const request = context.switchToHttp().getRequest()
    const key = `${request.ip}:${request.url}`
    const now = Date.now()

    const entry = rateLimitStore.get(key)

    if (!entry || now > entry.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs })
      return true
    }

    if (entry.count >= limit) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS)
    }

    entry.count++
    return true
  }
}
