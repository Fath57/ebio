import { describe, expect, it } from 'vitest'
import { ProviderTransactionStatus as Status } from './provider-transaction.entity'
import { ABANDON_AFTER_MS, nextStatus } from './provider-transactions.service'

const now = new Date('2026-10-03T12:00:00Z')
const fresh = new Date(now.getTime() - 60_000)
const old = new Date(now.getTime() - ABANDON_AFTER_MS - 60_000)

describe('nextStatus', () => {
  it('follows a definite answer from the provider', () => {
    expect(nextStatus(Status.PENDING, 'completed', fresh, now)).toBe(Status.COMPLETED)
    expect(nextStatus(Status.PENDING, 'failed', fresh, now)).toBe(Status.FAILED)
  })

  it('keeps a recent operation pending while the provider has no answer', () => {
    expect(nextStatus(Status.PENDING, 'pending', fresh, now)).toBe(Status.PENDING)
  })

  it('calls a page still pending after the delay abandoned', () => {
    expect(nextStatus(Status.PENDING, 'pending', old, now)).toBe(Status.ABANDONED)
  })

  it('honours a late payment on an abandoned or failed operation', () => {
    expect(nextStatus(Status.ABANDONED, 'completed', old, now)).toBe(Status.COMPLETED)
    expect(nextStatus(Status.FAILED, 'completed', old, now)).toBe(Status.COMPLETED)
  })

  it('never moves a completed operation', () => {
    expect(nextStatus(Status.COMPLETED, 'failed', fresh, now)).toBe(Status.COMPLETED)
    expect(nextStatus(Status.COMPLETED, 'pending', old, now)).toBe(Status.COMPLETED)
  })
})
