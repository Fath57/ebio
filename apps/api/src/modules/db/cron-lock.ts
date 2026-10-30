import type { Knex } from '@mikro-orm/postgresql'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'

const logger = new Logger('CronLock')

/** Set once the database is up; until then (unit tests) a job runs unguarded. */
let knex: Knex | null = null

/** Hands the lock its connection — the registrar at boot, a test with a fake. */
export function setCronLockConnection(connection: Knex | null): void {
  knex = connection
}

/** Advisory lock key for a job: one namespace, so no clash with any other advisory lock. */
export function cronLockName(job: string): string {
  return `ebio-cron:${job}`
}

/**
 * Runs `job` only if no other process holds its lock, and keeps the lock
 * until the job is done.
 *
 * The lock is transaction-scoped (`pg_try_advisory_xact_lock`): it lives on
 * the connection of a transaction opened for it, so pooling can never hand
 * it to another query, and it vanishes with the transaction — even when the
 * process dies mid-job, Postgres frees it with the connection. The job's own
 * queries go through their usual connections.
 *
 * Returns false when the turn was skipped.
 */
export async function runExclusively(job: string, run: () => Promise<void>): Promise<boolean> {
  if (!knex)
    return run().then(() => true)

  const trx = await knex.transaction()
  try {
    const result = await trx.raw('SELECT pg_try_advisory_xact_lock(hashtext(?)) AS locked', [cronLockName(job)])
    const locked = (result.rows?.[0] as { locked?: boolean } | undefined)?.locked === true
    if (!locked) {
      await trx.commit()
      return false
    }
    await run()
    await trx.commit()
    return true
  }
  catch (error) {
    await trx.rollback().catch(() => undefined)
    throw error
  }
}

/**
 * Makes a scheduled job run on one instance at a time.
 *
 * Every instance of the API carries the same `@Cron` jobs. Two of them alive
 * at once — a container a failed deploy left running, say — and each job runs
 * twice: an order refunded twice, an escrow released twice, a payout sent
 * twice. With this decorator the second instance finds the lock taken and
 * skips its turn; so does a run that would overlap the previous, still busy one.
 *
 * Place it between `@Cron` and `@EnsureRequestContext`:
 *
 *   @Cron(CronExpression.EVERY_HOUR)
 *   @SingleInstance()
 *   @EnsureRequestContext()
 *   async job() {}
 */
export function SingleInstance(name?: string): MethodDecorator {
  return (target, propertyKey, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (...args: unknown[]) => Promise<void>
    const job = name ?? `${target.constructor.name}.${String(propertyKey)}`

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      const ran = await runExclusively(job, () => original.apply(this, args))
      if (!ran)
        logger.debug(`${job} skipped: another instance holds the lock`)
    }
    return descriptor
  }
}

/** Hands the connection to the decorator once the ORM is ready. */
@Injectable()
export class CronLockRegistrar implements OnModuleInit {
  constructor(private readonly em: EntityManager) {}

  onModuleInit(): void {
    setCronLockConnection(this.em.getKnex())
  }
}
