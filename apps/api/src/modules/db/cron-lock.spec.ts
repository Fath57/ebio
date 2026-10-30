import type { Knex } from '@mikro-orm/postgresql'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cronLockName, runExclusively, setCronLockConnection, SingleInstance } from './cron-lock'

/** A knex whose transaction answers the lock query with `locked`. */
function fakeKnex(locked: boolean) {
  const trx = {
    raw: vi.fn().mockResolvedValue({ rows: [{ locked }] }),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
  }
  const knex = { transaction: vi.fn().mockResolvedValue(trx) }
  return { knex: knex as unknown as Knex, trx }
}

describe('runExclusively', () => {
  afterEach(() => setCronLockConnection(null))

  it('runs the job when it takes the lock, and releases it after', async () => {
    const { knex, trx } = fakeKnex(true)
    setCronLockConnection(knex)
    const job = vi.fn().mockResolvedValue(undefined)

    await expect(runExclusively('orders.autoCancel', job)).resolves.toBe(true)
    expect(job).toHaveBeenCalledOnce()
    expect(trx.raw).toHaveBeenCalledWith(expect.stringContaining('pg_try_advisory_xact_lock'), [cronLockName('orders.autoCancel')])
    expect(trx.commit).toHaveBeenCalledOnce()
  })

  it('skips the job when another instance holds the lock', async () => {
    const { knex, trx } = fakeKnex(false)
    setCronLockConnection(knex)
    const job = vi.fn()

    await expect(runExclusively('orders.autoCancel', job)).resolves.toBe(false)
    expect(job).not.toHaveBeenCalled()
    expect(trx.commit).toHaveBeenCalledOnce()
  })

  it('rolls back, so the lock goes, and lets the error through', async () => {
    const { knex, trx } = fakeKnex(true)
    setCronLockConnection(knex)

    await expect(runExclusively('job', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    expect(trx.rollback).toHaveBeenCalledOnce()
    expect(trx.commit).not.toHaveBeenCalled()
  })

  it('runs unguarded before the database is wired (unit tests)', async () => {
    const job = vi.fn().mockResolvedValue(undefined)
    await expect(runExclusively('job', job)).resolves.toBe(true)
    expect(job).toHaveBeenCalledOnce()
  })
})

describe('singleInstance', () => {
  afterEach(() => setCronLockConnection(null))

  it('keeps `this` and names the lock after the class and method', async () => {
    const { knex, trx } = fakeKnex(true)
    setCronLockConnection(knex)

    class Scheduler {
      calls = 0
      @SingleInstance()
      async tick(): Promise<void> {
        this.calls++
      }
    }
    const scheduler = new Scheduler()
    await scheduler.tick()

    expect(scheduler.calls).toBe(1)
    expect(trx.raw).toHaveBeenCalledWith(expect.any(String), [cronLockName('Scheduler.tick')])
  })
})
