import { HttpException } from '@nestjs/common'
import { RateLimitGuard } from './rate-limit.guard'

function buildContext(request: Record<string, unknown>) {
  return {
    getHandler: () => () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as never
}

function buildGuard(limit: number) {
  const reflector = { get: vi.fn((key: string) => (key === 'rateLimit' ? limit : 60_000)) }
  return new RateLimitGuard(reflector as never)
}

describe('limite de débit', () => {
  it('compte par route, quelle que soit la recherche tapée', () => {
    const guard = buildGuard(2)
    const route = { path: '/geocoding/search' }

    guard.canActivate(buildContext({ ip: '10.0.0.1', method: 'GET', route, path: '/geocoding/search?q=co' }))
    guard.canActivate(buildContext({ ip: '10.0.0.1', method: 'GET', route, path: '/geocoding/search?q=cot' }))

    expect(() => guard.canActivate(buildContext({ ip: '10.0.0.1', method: 'GET', route, path: '/geocoding/search?q=coto' })))
      .toThrow(HttpException)
  })

  it('ne mélange pas deux adresses', () => {
    const guard = buildGuard(1)
    const route = { path: '/otp/verify' }

    guard.canActivate(buildContext({ ip: '10.0.0.2', method: 'POST', route }))

    expect(guard.canActivate(buildContext({ ip: '10.0.0.3', method: 'POST', route }))).toBe(true)
  })
})
