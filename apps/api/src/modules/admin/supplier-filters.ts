/** Filters of the back-office supplier list, as read from the query string. */
export interface SupplierFilters {
  q?: string
  type?: string
  mode?: string
  /** At least this many orders received (paid or placed; abandoned payments excluded). */
  minOrders?: number
  /** At least this much on the shop's wallet, FCFA. */
  minBalance?: number
  /** At least this many products on sale. */
  minProducts?: number
  minRating?: number
  /** No order received for at least this many days (or ever). */
  inactiveDays?: number
  /** `yes`: placed on the map; `no`: no coordinates, invisible to buyers. */
  located?: 'yes' | 'no'
  /** `yes`: a commission rate negotiated for this shop; `no`: the category rates. */
  negotiatedRate?: 'yes' | 'no'
  createdFrom?: Date
  createdTo?: Date
}

/**
 * The columns the conditions read. Computed once per shop by lateral joins,
 * so a filter on the order count and the same count shown in the list never
 * disagree.
 */
export const SUPPLIER_LIST_FROM = `FROM suppliers s
  LEFT JOIN users u ON s.user_id = u.id
  LEFT JOIN wallets w ON w.supplier_id = s.id
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE o.status <> 'PENDING_PAYMENT') AS order_count,
           MAX(o."createdAt") FILTER (WHERE o.status <> 'PENDING_PAYMENT') AS last_order_at
    FROM orders o WHERE o.supplier_id = s.id
  ) os ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS product_count FROM products p WHERE p.supplier_id = s.id AND p.status = 'ACTIVE'
  ) ps ON true`

/** SQL conditions and bound values for the filters; values are always bound, never inlined. */
export function buildSupplierConditions(filters: SupplierFilters): { conditions: string[], values: unknown[] } {
  const conditions: string[] = ['1=1']
  const values: unknown[] = []

  if (filters.q) {
    conditions.push(`(s.shop_name ILIKE ? OR u.name ILIKE ? OR u.email ILIKE ? OR u.phone ILIKE ? OR s.neighborhood ILIKE ?)`)
    const like = `%${filters.q}%`
    values.push(like, like, like, like, like)
  }
  if (filters.type) {
    conditions.push(`s.type = ?`)
    values.push(filters.type)
  }
  if (filters.mode) {
    conditions.push(`s.mode = ?`)
    values.push(filters.mode)
  }
  if (filters.minOrders !== undefined) {
    conditions.push(`COALESCE(os.order_count, 0) >= ?`)
    values.push(filters.minOrders)
  }
  if (filters.minBalance !== undefined) {
    conditions.push(`COALESCE(w.balance, 0) >= ?`)
    values.push(filters.minBalance)
  }
  if (filters.minProducts !== undefined) {
    conditions.push(`COALESCE(ps.product_count, 0) >= ?`)
    values.push(filters.minProducts)
  }
  if (filters.minRating !== undefined) {
    conditions.push(`s.global_rating >= ?`)
    values.push(filters.minRating)
  }
  if (filters.inactiveDays !== undefined) {
    conditions.push(`(os.last_order_at IS NULL OR os.last_order_at < NOW() - make_interval(days => ?))`)
    values.push(filters.inactiveDays)
  }
  if (filters.located === 'yes')
    conditions.push(`s.location IS NOT NULL`)
  if (filters.located === 'no')
    conditions.push(`s.location IS NULL`)
  if (filters.negotiatedRate === 'yes')
    conditions.push(`s.commission_rate IS NOT NULL`)
  if (filters.negotiatedRate === 'no')
    conditions.push(`s.commission_rate IS NULL`)
  if (filters.createdFrom) {
    conditions.push(`s."createdAt" >= ?`)
    values.push(filters.createdFrom)
  }
  if (filters.createdTo) {
    conditions.push(`s."createdAt" < ?`)
    values.push(filters.createdTo)
  }

  return { conditions, values }
}

/** A non-negative number from the query string, undefined when absent or unreadable. */
export function readMinimum(value?: string): number | undefined {
  if (value === undefined || value.trim() === '')
    return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

/** A calendar day (`YYYY-MM-DD`) from the query string; `endOfDay` moves to the next midnight. */
export function readDay(value?: string, endOfDay = false): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return undefined
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()))
    return undefined
  if (endOfDay)
    date.setUTCDate(date.getUTCDate() + 1)
  return date
}
