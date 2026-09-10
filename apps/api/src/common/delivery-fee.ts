/**
 * Single source of truth for what a delivery costs the buyer.
 *
 * Pricing is platform-wide (admin-tuned, see PlatformSettingsService), never
 * per shop: one of three modes, a basket threshold for free delivery, and a
 * hard distance limit. Distances are shop → drop-off point, computed by the
 * caller (PostGIS) and passed in.
 */

export type DeliveryPricingMode = 'FLAT' | 'DISTANCE' | 'ZONES'

export interface DeliveryZone {
  /** Ring outer radius from the shop, km. Rings are sorted ascending. */
  maxKm: number
  fee: number
}

export interface DeliveryPricingConfig {
  mode: DeliveryPricingMode
  flat: { fee: number }
  distance: {
    baseFee: number
    perKm: number
    minFee: number
    maxFee: number
    /** Fees are rounded up to this step (100 = to the next 100 FCFA). */
    roundTo: number
  }
  zones: DeliveryZone[]
  /** Items subtotal above which delivery is free; null disables. */
  freeFrom: number | null
  /** Beyond this distance the order is refused. */
  maxDistanceKm: number
}

export const DEFAULT_DELIVERY_PRICING: DeliveryPricingConfig = {
  mode: 'DISTANCE',
  flat: { fee: 500 },
  distance: { baseFee: 300, perKm: 100, minFee: 300, maxFee: 2500, roundTo: 100 },
  zones: [
    { maxKm: 3, fee: 500 },
    { maxKm: 8, fee: 1000 },
    { maxKm: 25, fee: 1500 },
  ],
  freeFrom: null,
  maxDistanceKm: 25,
}

export type DeliveryFeeReason
  = | 'PICKUP'
    | 'FREE_THRESHOLD'
    | 'FLAT'
    | 'DISTANCE'
    | 'ZONE'
  /** Distance-based mode but the buyer gave no drop-off point yet. */
    | 'NO_POSITION'
  /** The shop has no position: the flat fee applies as a fallback. */
    | 'NO_SHOP_POSITION'
    | 'OUT_OF_RANGE'

export interface DeliveryFeeInput {
  isDelivery: boolean
  /** Items only: the fee never counts toward its own waiver. */
  itemsTotal: number
  /** Shop → drop-off, km; null when either side has no position. */
  distanceKm: number | null
  hasShopPosition: boolean
}

export interface DeliveryFeeResult {
  /** Null when the delivery cannot be priced (see reason). */
  fee: number | null
  reason: DeliveryFeeReason
  distanceKm: number | null
}

function roundUpTo(value: number, step: number): number {
  const safeStep = step > 0 ? step : 1
  return Math.ceil(value / safeStep) * safeStep
}

export function computeDeliveryFee(config: DeliveryPricingConfig, input: DeliveryFeeInput): DeliveryFeeResult {
  const { distanceKm } = input
  if (!input.isDelivery) {
    return { fee: 0, reason: 'PICKUP', distanceKm }
  }
  if (config.freeFrom !== null && config.freeFrom > 0 && input.itemsTotal >= config.freeFrom) {
    return { fee: 0, reason: 'FREE_THRESHOLD', distanceKm }
  }
  if (config.mode === 'FLAT') {
    return { fee: Math.round(config.flat.fee), reason: 'FLAT', distanceKm }
  }
  if (!input.hasShopPosition) {
    return { fee: Math.round(config.flat.fee), reason: 'NO_SHOP_POSITION', distanceKm }
  }
  if (distanceKm === null) {
    return { fee: null, reason: 'NO_POSITION', distanceKm }
  }
  if (distanceKm > config.maxDistanceKm) {
    return { fee: null, reason: 'OUT_OF_RANGE', distanceKm }
  }
  if (config.mode === 'DISTANCE') {
    const { baseFee, perKm, minFee, maxFee, roundTo } = config.distance
    const raw = roundUpTo(baseFee + perKm * distanceKm, roundTo)
    return { fee: Math.min(Math.max(raw, minFee), maxFee), reason: 'DISTANCE', distanceKm }
  }
  const ring = [...config.zones].sort((a, b) => a.maxKm - b.maxKm).find(zone => distanceKm <= zone.maxKm)
  if (!ring) {
    return { fee: null, reason: 'OUT_OF_RANGE', distanceKm }
  }
  return { fee: Math.round(ring.fee), reason: 'ZONE', distanceKm }
}

/**
 * What the courier keeps out of the delivery fee. eBio takes `rate` of the
 * fee (admin-tunable, 0.10 by default); the rest is the courier's earning.
 * Rounded to the FCFA — there is no sub-unit in Mobile Money — and never
 * negative, whatever a stray rate above 1 would suggest.
 */
export function computeCourierFee(deliveryFee: number, rate: number): number {
  if (!(deliveryFee > 0)) {
    return 0
  }
  const safeRate = Math.min(Math.max(rate, 0), 1)
  return Math.round(deliveryFee * (1 - safeRate))
}
