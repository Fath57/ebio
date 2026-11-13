import { PaymentMethod, PickupMode } from '../orders/entities/order.entity'
import { readDay, readMinimum } from './supplier-filters'

/** Filters of the back-office order list beyond status and search. */
export interface OrderFilters {
  supplierId?: string
  paymentMethod?: PaymentMethod
  pickupMode?: PickupMode
  createdFrom?: Date
  /** Exclusive: the day after the last day asked for. */
  createdTo?: Date
  minAmount?: number
  maxAmount?: number
  /** `with`: a promo code was applied; `without`: none. */
  promo?: 'with' | 'without'
  /** Who paid the delivery instead of the buyer; `none`: the buyer did. */
  sponsor?: 'SUPPLIER' | 'PLATFORM' | 'none'
  /** Home deliveries only: `assigned` has a courier on a run, `unassigned` does not. */
  courier?: 'assigned' | 'unassigned'
  /** `true`: carts sent to a relative only; `false`: ordinary orders only. */
  gift?: boolean
}

/** Raw query-string values, as the controller receives them. */
export interface OrderFilterQuery {
  supplierId?: string
  paymentMethod?: string
  pickupMode?: string
  from?: string
  to?: string
  minAmount?: string
  maxAmount?: string
  promo?: string
  sponsor?: string
  courier?: string
  gift?: string
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? value as T : undefined
}

/** Unknown or malformed values are dropped rather than rejected: a stale link still opens. */
export function readOrderFilters(query: OrderFilterQuery): OrderFilters {
  return {
    supplierId: query.supplierId || undefined,
    paymentMethod: oneOf(query.paymentMethod, Object.values(PaymentMethod)),
    pickupMode: oneOf(query.pickupMode, Object.values(PickupMode)),
    createdFrom: readDay(query.from),
    createdTo: readDay(query.to, true),
    minAmount: readMinimum(query.minAmount),
    maxAmount: readMinimum(query.maxAmount),
    promo: oneOf(query.promo, ['with', 'without'] as const),
    sponsor: oneOf(query.sponsor, ['SUPPLIER', 'PLATFORM', 'none'] as const),
    courier: oneOf(query.courier, ['assigned', 'unassigned'] as const),
    gift: query.gift === 'true' ? true : query.gift === 'false' ? false : undefined,
  }
}

const IS_GIFT = `EXISTS (SELECT 1 FROM checkouts gc WHERE gc.id = o.checkout_id AND gc.recipient_phone IS NOT NULL)`

const HAS_COURIER = `EXISTS (SELECT 1 FROM deliveries d WHERE d.order_id = o.id AND d.courier_id IS NOT NULL)`

/** SQL conditions on `orders o`; values are always bound, never inlined. */
export function buildOrderConditions(filters: OrderFilters): { conditions: string[], values: unknown[] } {
  const conditions: string[] = []
  const values: unknown[] = []

  if (filters.supplierId) {
    conditions.push('o.supplier_id = ?')
    values.push(filters.supplierId)
  }
  if (filters.paymentMethod) {
    conditions.push('o.payment_method = ?')
    values.push(filters.paymentMethod)
  }
  if (filters.pickupMode) {
    conditions.push('o.pickup_mode = ?')
    values.push(filters.pickupMode)
  }
  if (filters.createdFrom) {
    conditions.push('o."createdAt" >= ?')
    values.push(filters.createdFrom)
  }
  if (filters.createdTo) {
    conditions.push('o."createdAt" < ?')
    values.push(filters.createdTo)
  }
  if (filters.minAmount !== undefined) {
    conditions.push('o.total_amount >= ?')
    values.push(filters.minAmount)
  }
  if (filters.maxAmount !== undefined) {
    conditions.push('o.total_amount <= ?')
    values.push(filters.maxAmount)
  }
  if (filters.promo === 'with')
    conditions.push('o.promo_code_id IS NOT NULL')
  if (filters.promo === 'without')
    conditions.push('o.promo_code_id IS NULL')
  if (filters.sponsor === 'none') {
    conditions.push('o.delivery_sponsor IS NULL')
  }
  else if (filters.sponsor) {
    conditions.push('o.delivery_sponsor = ?')
    values.push(filters.sponsor)
  }
  if (filters.courier === 'assigned')
    conditions.push(HAS_COURIER)
  if (filters.courier === 'unassigned')
    conditions.push(`o.pickup_mode = '${PickupMode.DELIVERY}' AND NOT ${HAS_COURIER}`)
  if (filters.gift === true)
    conditions.push(IS_GIFT)
  if (filters.gift === false)
    conditions.push(`NOT ${IS_GIFT}`)

  return { conditions, values }
}
