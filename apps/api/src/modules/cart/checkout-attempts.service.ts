import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { CheckoutAttempt, CheckoutAttemptKind, CheckoutAttemptOutcome } from './entities/checkout-attempt.entity'

export interface AttemptFacts {
  shopCount: number
  itemCount: number
  total: number
  distanceKm?: number
}

/** Long enough to follow up a call, short enough not to become an archive. */
const KEEP_DAYS = 30

/**
 * What buyers tried, and what they were told.
 *
 * Written so that "I can't order" has an answer. The refusals are the API's
 * own sentences, so the agent and the caller read the same words.
 */
@Injectable()
export class CheckoutAttemptsService {
  private readonly logger = new Logger(CheckoutAttemptsService.name)

  constructor(private readonly em: EntityManager) {}

  /**
   * Records an attempt without ever failing the attempt itself.
   *
   * This is a diary, not a step of the purchase: a write that goes wrong here
   * must not turn a successful order into an error for the buyer.
   */
  async record(
    userId: string,
    kind: CheckoutAttemptKind,
    outcome: CheckoutAttemptOutcome,
    facts: AttemptFacts,
    detail?: string,
  ): Promise<void> {
    try {
      const fork = this.em.fork()
      fork.create(CheckoutAttempt, {
        user: fork.getReference(User, userId),
        kind,
        outcome,
        detail: detail?.slice(0, 300),
        shopCount: facts.shopCount,
        itemCount: facts.itemCount,
        total: Math.round(facts.total),
        distanceKm: facts.distanceKm,
      })
      await fork.flush()
    }
    catch (error) {
      this.logger.warn(`Tentative de commande non consignée pour ${userId} — ${error}`)
    }
  }

  /** This person's last attempts, newest first. */
  async listForUser(userId: string, limit = 20): Promise<CheckoutAttempt[]> {
    return this.em.find(
      CheckoutAttempt,
      { user: { id: userId } },
      { orderBy: { at: 'DESC' }, limit },
    )
  }

  /** Nobody looks back a month, and this is about people. */
  async purgeOld(): Promise<number> {
    const result = await this.em.getConnection().execute<{ count: string }[]>(
      `WITH removed AS (
         DELETE FROM checkout_attempts
         WHERE at < NOW() - (? * INTERVAL '1 day')
         RETURNING 1
       )
       SELECT COUNT(*)::text AS count FROM removed`,
      [KEEP_DAYS],
    )
    return Number(result[0]?.count ?? 0)
  }
}
