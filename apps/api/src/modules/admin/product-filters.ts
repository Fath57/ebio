/** Filters of the back-office catalogue beyond shop, category, status, stock and promotion. */
export interface ProductAdvancedFilters {
  minPrice?: number
  maxPrice?: number
  /** At least this many units sold (paid or placed orders, cancellations excluded). */
  minSold?: number
  /** `none`: never sold; `some`: sold at least once. */
  sales?: 'none' | 'some'
  /** Code of a label from the back-office catalogue. */
  label?: string
  /** `missing`: no photo at all. */
  photo?: 'missing'
  /** `validated`: shop open to buyers; `not_validated`: invisible whatever the product says. */
  shop?: 'validated' | 'not_validated'
  /** `formats`: sold in several formats; `packs`: at least one pack. */
  formats?: 'formats' | 'packs'
  minRating?: number
  createdFrom?: Date
  createdTo?: Date
}

/** Units sold and orders per product, computed once and shared by filter, column and sort. */
export const PRODUCT_SALES_JOIN = `LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(oi.quantity), 0) AS units_sold,
           COUNT(DISTINCT oi.order_id) AS order_count
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.product_id = p.id AND o.status NOT IN ('PENDING_PAYMENT', 'CANCELLED')
  ) sales ON true`

/** SQL conditions and bound values; values are always bound, never inlined. */
export function buildProductConditions(filters: ProductAdvancedFilters): { conditions: string[], values: unknown[] } {
  const conditions: string[] = []
  const values: unknown[] = []

  if (filters.minPrice !== undefined) {
    conditions.push('p.price_per_unit >= ?')
    values.push(filters.minPrice)
  }
  if (filters.maxPrice !== undefined) {
    conditions.push('p.price_per_unit <= ?')
    values.push(filters.maxPrice)
  }
  if (filters.minSold !== undefined) {
    conditions.push('sales.units_sold >= ?')
    values.push(filters.minSold)
  }
  if (filters.sales === 'none')
    conditions.push('sales.units_sold = 0')
  if (filters.sales === 'some')
    conditions.push('sales.units_sold > 0')
  if (filters.label) {
    // `jsonb_exists`, not the `?` operator: knex reads every `?` as a placeholder.
    conditions.push('jsonb_exists(p.labels, ?)')
    values.push(filters.label)
  }
  if (filters.photo === 'missing')
    conditions.push(`jsonb_array_length(COALESCE(p.photos, '[]'::jsonb)) = 0`)
  if (filters.shop === 'validated')
    conditions.push(`s.validation_status = 'VALIDATED'`)
  if (filters.shop === 'not_validated')
    conditions.push(`s.validation_status <> 'VALIDATED'`)
  if (filters.formats === 'formats')
    conditions.push('EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id)')
  if (filters.formats === 'packs')
    conditions.push('EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.pack_size IS NOT NULL)')
  if (filters.minRating !== undefined) {
    conditions.push('p.rating_avg >= ?')
    values.push(filters.minRating)
  }
  if (filters.createdFrom) {
    conditions.push('p."createdAt" >= ?')
    values.push(filters.createdFrom)
  }
  if (filters.createdTo) {
    conditions.push('p."createdAt" < ?')
    values.push(filters.createdTo)
  }

  return { conditions, values }
}
