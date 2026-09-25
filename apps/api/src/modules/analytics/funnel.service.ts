import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'

export interface FunnelStage {
  key: 'CART' | 'QUOTE' | 'ORDER' | 'DELIVERED'
  label: string
  people: number
  /** Share of the stage above; null for the first, which has nothing above it. */
  rate: number | null
}

export interface FunnelReport {
  days: number
  /**
   * When the measurement began.
   *
   * Baskets and quotes have only been recorded since the instrumentation was
   * added; orders go back further. Over a window that reaches before this,
   * the upper stages are empty and the funnel widens downwards — which is not
   * a finding, it is an artefact, and the page has to say so rather than let
   * someone read a rate off it.
   */
  measuringSince: string | null
  /**
   * Whether the window is entirely covered by the measurement.
   *
   * Computed here because the server knows both dates; leaving the client to
   * compare them would have it reading the clock while it draws.
   */
  windowComplete: boolean
  stages: FunnelStage[]
  /** Why quotes were refused, most common first. */
  refusals: Array<{ reason: string, people: number }>
  /** The step where most people were lost, named. */
  worstStep: { from: string, to: string, lost: number } | null
}

/**
 * Where people stop, between filling a basket and receiving it.
 *
 * Counted in people and not in events: someone who tries five times and gives
 * up is one person leaking, and counting their five attempts would make the
 * funnel look busier precisely where it works worst.
 *
 * Only the window matters, never the lifetime: a funnel is read to decide
 * what to change this week.
 */
@Injectable()
export class FunnelService {
  constructor(private readonly em: EntityManager) {}

  async report(days: number): Promise<FunnelReport> {
    const connection = this.em.getConnection()

    const [counts] = await connection.execute<Array<{
      carts: string
      quotes: string
      orders: string
      delivered: string
    }>>(
      `SELECT
         (SELECT COUNT(DISTINCT c.user_id)
          FROM carts c
          JOIN cart_items ci ON ci.cart_id = c.id
          WHERE c.updated_at >= NOW() - (? * INTERVAL '1 day'))::text AS carts,

         (SELECT COUNT(DISTINCT a.user_id)
          FROM checkout_attempts a
          WHERE a.kind = 'QUOTE' AND a.at >= NOW() - (? * INTERVAL '1 day'))::text AS quotes,

         (SELECT COUNT(DISTINCT o.buyer_id)
          FROM orders o
          WHERE o."createdAt" >= NOW() - (? * INTERVAL '1 day'))::text AS orders,

         (SELECT COUNT(DISTINCT o.buyer_id)
          FROM orders o
          WHERE o."createdAt" >= NOW() - (? * INTERVAL '1 day')
            AND o.status = 'DELIVERED')::text AS delivered`,
      [days, days, days, days],
    )

    const refusals = await connection.execute<Array<{ reason: string, people: string }>>(
      `SELECT COALESCE(a.detail, 'Motif non enregistré') AS reason,
              COUNT(DISTINCT a.user_id)::text AS people
       FROM checkout_attempts a
       WHERE a.outcome = 'REFUSED'
         AND a.at >= NOW() - (? * INTERVAL '1 day')
       GROUP BY COALESCE(a.detail, 'Motif non enregistré')
       ORDER BY COUNT(DISTINCT a.user_id) DESC
       LIMIT 8`,
      [days],
    )

    const [since] = await connection.execute<Array<{ started: string | null }>>(
      `SELECT LEAST(
         (SELECT MIN(at) FROM checkout_attempts),
         (SELECT MIN(created_at) FROM carts)
       )::text AS started`,
    )

    const numbers = {
      carts: Number(counts?.carts ?? 0),
      quotes: Number(counts?.quotes ?? 0),
      orders: Number(counts?.orders ?? 0),
      delivered: Number(counts?.delivered ?? 0),
    }

    const stages: FunnelStage[] = [
      { key: 'CART', label: 'Panier rempli', people: numbers.carts, rate: null },
      { key: 'QUOTE', label: 'Devis demandé', people: numbers.quotes, rate: share(numbers.quotes, numbers.carts) },
      { key: 'ORDER', label: 'Commande passée', people: numbers.orders, rate: share(numbers.orders, numbers.quotes) },
      { key: 'DELIVERED', label: 'Commande livrée', people: numbers.delivered, rate: share(numbers.delivered, numbers.orders) },
    ]

    return {
      days,
      measuringSince: since?.started ?? null,
      windowComplete: since?.started
        ? new Date(since.started).getTime() <= Date.now() - days * 24 * 60 * 60 * 1000
        : false,
      stages,
      refusals: refusals.map(row => ({ reason: row.reason, people: Number(row.people) })),
      worstStep: worstStep(stages),
    }
  }
}

/** Null rather than zero when there is nothing above: no one lost from nobody. */
function share(value: number, previous: number): number | null {
  // A stage cannot hold more people than the one above it. When it does, the
  // window reaches back before the upper stage was being recorded, and any
  // ratio would be an artefact of that — not a rate.
  if (previous === 0 || value > previous) {
    return null
  }
  return Math.round((value / previous) * 100)
}

/**
 * The step that loses the most people, in absolute numbers.
 *
 * Absolute and not proportional on purpose: a step that drops 80 % of four
 * people matters less than one that drops 30 % of two hundred, and the second
 * is the one worth a week's work.
 */
function worstStep(stages: FunnelStage[]): FunnelReport['worstStep'] {
  let worst: FunnelReport['worstStep'] = null
  for (let i = 1; i < stages.length; i++) {
    const lost = stages[i - 1].people - stages[i].people
    if (lost > 0 && (worst === null || lost > worst.lost)) {
      worst = { from: stages[i - 1].label, to: stages[i].label, lost }
    }
  }
  return worst
}
