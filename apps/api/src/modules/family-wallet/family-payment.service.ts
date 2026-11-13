import type { EntityManager } from '@mikro-orm/postgresql'
import { monthStart } from './family-limits'

/**
 * What each member spent from the family wallet since the 1st of the month
 * (Benin time): purchases minus their refunds, never below zero (FR-020).
 *
 * A member removed then added again is a new row, yet their month still
 * counts (spec, edge cases): lines are summed across every row of the same
 * wallet with the same number.
 *
 * Run on the given entity manager, so that inside the payment transaction it
 * reads after the wallet lock.
 */
export async function spentThisMonthByMember(em: EntityManager, memberIds: string[], now: Date): Promise<Map<string, number>> {
  const spent = new Map<string, number>(memberIds.map(id => [id, 0]))
  if (memberIds.length === 0) {
    return spent
  }
  const rows = await em.execute<Array<{ member_id: string, spent: string | number | null }>>(
    `SELECT m.id AS member_id, -SUM(t.amount) AS spent
     FROM family_wallet_members m
     JOIN family_wallet_members same ON same.family_wallet_id = m.family_wallet_id AND same.phone = m.phone
     JOIN wallet_transactions t ON t.family_member_id = same.id
     WHERE m.id IN (${memberIds.map(() => '?').join(', ')})
       AND t.type IN ('ORDER_PAYMENT', 'REFUND')
       AND t."createdAt" >= ?
     GROUP BY m.id`,
    [...memberIds, monthStart(now)],
  )
  for (const row of rows) {
    spent.set(row.member_id, Math.max(0, Math.round(Number(row.spent ?? 0) * 100) / 100))
  }
  return spent
}

/** One member's spending of the month; see `spentThisMonthByMember`. */
export async function spentThisMonth(em: EntityManager, memberId: string, now: Date): Promise<number> {
  const spent = await spentThisMonthByMember(em, [memberId], now)
  return spent.get(memberId) ?? 0
}
