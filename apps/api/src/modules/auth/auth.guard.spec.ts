import { ForbiddenException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { assertAccountActive } from './auth.guard'

function blockedBody(fn: () => void): Record<string, unknown> {
  try {
    fn()
  }
  catch (error) {
    if (error instanceof ForbiddenException)
      return error.getResponse() as Record<string, unknown>
    throw error
  }
  throw new Error('expected a ForbiddenException')
}

describe('assertAccountActive', () => {
  it('lets active accounts and anonymous callers through', () => {
    expect(() => assertAccountActive(null)).not.toThrow()
    expect(() => assertAccountActive({})).not.toThrow()
    expect(() => assertAccountActive({ status: 'ACTIVE' })).not.toThrow()
  })

  it('refuses a banned account with the BANNED code and the reason', () => {
    const body = blockedBody(() => assertAccountActive({ status: 'BANNED', statusReason: 'Fraude' }))
    expect(body.code).toBe('ACCOUNT_BANNED')
    expect(body.reason).toBe('Fraude')
    expect(body.suspendedUntil).toBeNull()
  })

  it('refuses a suspension still running and reports its end date', () => {
    const until = new Date(Date.now() + 3_600_000)
    const body = blockedBody(() => assertAccountActive({ status: 'SUSPENDED', suspendedUntil: until }))
    expect(body.code).toBe('ACCOUNT_SUSPENDED')
    expect(body.suspendedUntil).toBe(until.toISOString())
  })

  it('refuses an open-ended suspension', () => {
    const body = blockedBody(() => assertAccountActive({ status: 'SUSPENDED', suspendedUntil: null }))
    expect(body.code).toBe('ACCOUNT_SUSPENDED')
    expect(body.suspendedUntil).toBeNull()
  })

  it('treats an expired suspension as active', () => {
    const until = new Date(Date.now() - 1_000)
    expect(() => assertAccountActive({ status: 'SUSPENDED', suspendedUntil: until.toISOString() })).not.toThrow()
  })
})
