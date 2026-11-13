import { BENIN_UTC_OFFSET_MINUTES } from '../../common/delivery-window'

/**
 * The family wallet's arithmetic, as pure functions: no database, no clock
 * but the one passed in. The payment re-runs them inside its transaction,
 * after the wallet lock; the checkout preview runs them to explain a refusal.
 */

/** Why a family wallet cannot pay a cart, in the order they are checked. */
export type FamilyRefusalReason = 'INACTIVE' | 'CATEGORY' | 'ORDER_MAX' | 'MONTHLY_CAP' | 'INSUFFICIENT'

/** Limits in FCFA; null means « no limit » (or « every category »). */
export interface FamilyLimits {
  monthlyCap: number | null
  orderMax: number | null
  categoryIds: string[] | null
}

/** What the wallet holds as defaults, as stored (numeric columns come back as strings). */
export interface FamilyWalletDefaults {
  defaultMonthlyCap?: string | number | null
  defaultOrderMax?: string | number | null
  defaultCategoryIds?: string[] | null
}

/** A member's own limits, as stored; null falls back to the default. */
export interface FamilyMemberLimits {
  monthlyCap?: string | number | null
  orderMax?: string | number | null
  categoryIds?: string[] | null
}

export interface FamilyRefusal {
  reason: FamilyRefusalReason
  /** Only for CATEGORY: the cart lines that fall outside the allowed list. */
  blockedProductIds?: string[]
}

export interface FamilyRefusalInput {
  wallet: { status: string }
  member: { status: string }
  effective: FamilyLimits
  /** What the member already spent this month, refunds deducted. */
  spent: number
  /** The family wallet balance. */
  balance: number
  /** The cart total to pay. */
  total: number
  /** Each product of the cart with its category. */
  productCategoryIds: Array<{ productId: string, categoryId: string | null }>
}

const MINUTE_MS = 60_000

/** A stored amount, or null when absent. */
export function toAmount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : null
}

/** Limit by limit: the member's own when set, the wallet's default otherwise. */
export function effectiveLimits(wallet: FamilyWalletDefaults, member: FamilyMemberLimits): FamilyLimits {
  return {
    monthlyCap: toAmount(member.monthlyCap) ?? toAmount(wallet.defaultMonthlyCap),
    orderMax: toAmount(member.orderMax) ?? toAmount(wallet.defaultOrderMax),
    categoryIds: member.categoryIds ?? wallet.defaultCategoryIds ?? null,
  }
}

/** What is left under the monthly cap, never below zero; null without a cap. */
export function remainingThisMonth(effective: FamilyLimits, spentThisMonth: number): number | null {
  if (effective.monthlyCap === null) {
    return null
  }
  return Math.max(0, effective.monthlyCap - spentThisMonth)
}

/**
 * What the member may still spend: the smaller of the balance and what the
 * monthly cap leaves (FR-012). The per-order maximum is not folded in: it
 * says how big one order may be, not how much is left.
 */
export function spendable(balance: number, effective: FamilyLimits, spentThisMonth: number): number {
  const available = Math.max(0, balance)
  const remaining = remainingThisMonth(effective, spentThisMonth)
  return remaining === null ? available : Math.min(available, remaining)
}

/**
 * Null when the wallet may pay the cart, the first reason it may not
 * otherwise (data-model §7): inactive, category, per-order maximum, monthly
 * cap, balance.
 */
export function refusalFor(input: FamilyRefusalInput): FamilyRefusal | null {
  if (input.wallet.status !== 'ACTIVE' || input.member.status !== 'ACTIVE') {
    return { reason: 'INACTIVE' }
  }

  const allowed = input.effective.categoryIds
  if (allowed !== null) {
    const allowedSet = new Set(allowed)
    const blocked = input.productCategoryIds
      .filter(line => line.categoryId === null || !allowedSet.has(line.categoryId))
      .map(line => line.productId)
    if (blocked.length > 0) {
      return { reason: 'CATEGORY', blockedProductIds: [...new Set(blocked)] }
    }
  }

  if (input.effective.orderMax !== null && input.total > input.effective.orderMax) {
    return { reason: 'ORDER_MAX' }
  }

  const remaining = remainingThisMonth(input.effective, input.spent)
  if (remaining !== null && input.total > remaining) {
    return { reason: 'MONTHLY_CAP' }
  }

  if (input.total > input.balance) {
    return { reason: 'INSUFFICIENT' }
  }
  return null
}

/**
 * The first instant of the calendar month in Benin (Africa/Porto-Novo, UTC+1
 * all year): the monthly cap restarts there, whatever the payer's own zone.
 */
export function monthStart(now: Date): Date {
  const local = new Date(now.getTime() + BENIN_UTC_OFFSET_MINUTES * MINUTE_MS)
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - BENIN_UTC_OFFSET_MINUTES * MINUTE_MS)
}
