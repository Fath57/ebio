import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

const SWEEP_INTERVAL_MS = 60_000

const rateLimitStore = new Map<string, { count: number, resetAt: number }>()
let nextSweepAt = 0

/** Expired windows are dropped once a minute: the map holds live windows only. */
function sweepExpired(now: number): void {
  if (now < nextSweepAt)
    return
  nextSweepAt = now + SWEEP_INTERVAL_MS
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt)
      rateLimitStore.delete(key)
  }
}

/**
 * Per-IP, per-route counter, in memory: it holds for one instance, which is
 * how the API runs today.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const limit = this.reflector.get<number>('rateLimit', context.getHandler()) ?? 10
    const windowMs = this.reflector.get<number>('rateLimitWindow', context.getHandler()) ?? 600_000

    const request = context.switchToHttp().getRequest()
    // The route, not the URL: a query string per keystroke would open a
    // fresh window — and a fresh map entry — on every search.
    const route = request.route?.path ?? request.path
    const key = `${request.ip}:${request.method}:${route}`
    const now = Date.now()
    sweepExpired(now)

    const entry = rateLimitStore.get(key)

    if (!entry || now > entry.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs })
      return true
    }

    if (entry.count >= limit) {
      throw new HttpException('Trop de tentatives, réessayez plus tard', HttpStatus.TOO_MANY_REQUESTS)
    }

    entry.count++
    return true
  }
}
