import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'

export interface CommissionItem {
  categorySlug: string
  totalPrice: number
}

export interface CommissionResult {
  /** Effective rate over the whole base, 4-decimal precision. */
  rate: number
  commissionAmount: number
  supplierAmount: number
}

/** Applied when a category has no row in commission_rates. */
const DEFAULT_RATE = 0.04

/** Category rates change rarely; a short cache keeps order creation cheap. */
const CACHE_TTL_MS = 60_000

@Injectable()
export class CommissionService {
  private cache: { rates: Record<string, number>, expiresAt: number } | null = null

  constructor(private readonly em: EntityManager) {}

  async getCategoryRates(): Promise<Record<string, number>> {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.rates
    }
    const rows: { category_slug: string, rate: number }[] = await this.em
      .getConnection()
      .execute(`SELECT category_slug, rate FROM commission_rates`)
    const rates = Object.fromEntries(rows.map(r => [r.category_slug, Number(r.rate)]))
    this.cache = { rates, expiresAt: Date.now() + CACHE_TTL_MS }
    return rates
  }

  /** Admin edits call this so the new rates apply immediately. */
  invalidateCache(): void {
    this.cache = null
  }

  /**
   * A rate negotiated with the supplier wins over the category grid; otherwise
   * each item pays its own category's rate. The base is the items only —
   * delivery is the shop's cost, passed through in full.
   */
  async calculateForItems(
    items: CommissionItem[],
    supplierRate: number | null | undefined,
  ): Promise<CommissionResult> {
    const base = items.reduce((sum, item) => sum + item.totalPrice, 0)

    let commissionAmount: number
    if (supplierRate != null) {
      commissionAmount = base * supplierRate
    }
    else {
      const rates = await this.getCategoryRates()
      commissionAmount = items.reduce(
        (sum, item) => sum + item.totalPrice * (rates[item.categorySlug] ?? DEFAULT_RATE),
        0,
      )
    }

    commissionAmount = Math.round(commissionAmount * 100) / 100
    const supplierAmount = Math.round((base - commissionAmount) * 100) / 100
    const rate = base > 0 ? Math.round((commissionAmount / base) * 10_000) / 10_000 : 0

    return { rate, commissionAmount, supplierAmount }
  }
}
