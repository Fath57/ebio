/**
 * Single source of truth for what a delivery costs the buyer.
 *
 * Pricing is platform-wide (admin-tuned, see PlatformSettingsService), never
 * per shop: one of three modes, a basket threshold for free delivery, and a
 * hard distance limit. Distances are computed by the caller and passed in.
 *
 * Depuis le panier unifié, cette distance est celle de la **tournée complète**
 * — collecte à collecte, puis dernière collecte jusqu'au point de chute (voir
 * `computeRunDistance`). C'est le trajet que le livreur parcourt réellement,
 * donc la seule base honnête pour le tarif comme pour sa rémunération. Une
 * tournée d'une seule boutique retombe exactement sur l'ancien calcul.
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
  /**
   * Items only: the fee never counts toward its own waiver. Sur un panier
   * multi-boutiques, c'est le total du panier entier — le seuil de gratuité
   * s'évalue sur ce que l'acheteur voit, c'est-à-dire un panier.
   */
  itemsTotal: number
  /** Distance de la tournée, km ; null quand un point manque. */
  distanceKm: number | null
  /**
   * Toutes les boutiques de la tournée sont localisées. Une seule qui ne l'est
   * pas suffit à rendre la distance incalculable : le forfait s'applique, et
   * la commande passe quand même (`NO_SHOP_POSITION` n'est pas bloquant).
   */
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

/** Un point de la tournée : une boutique à collecter, ou le point de chute. */
export interface RunPoint {
  latitude: number | null
  longitude: number | null
}

const EARTH_RADIUS_KM = 6371

function haversineKm(from: RunPoint, to: RunPoint): number | null {
  if (from.latitude === null || from.longitude === null || to.latitude === null || to.longitude === null) {
    return null
  }
  const toRad = (deg: number): number => (deg * Math.PI) / 180
  const dLat = toRad(to.latitude - from.latitude)
  const dLng = toRad(to.longitude - from.longitude)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * Distance d'une tournée : collecte à collecte dans l'ordre de passage, puis
 * dernière collecte jusqu'au point de chute.
 *
 * C'est le trajet réel du livreur, et non la somme des distances
 * boutique → acheteur : deux boutiques voisines ne doivent pas coûter deux
 * fois le même trajet. Une seule boutique redonne la distance
 * boutique → acheteur, donc le comportement d'avant le panier unifié.
 *
 * Renvoie `null` dès qu'un point manque : la distance n'a alors aucun sens, et
 * `computeDeliveryFee` retombe sur le forfait.
 */
export function computeRunDistance(pickups: RunPoint[], dropoff: RunPoint): number | null {
  if (pickups.length === 0) {
    return null
  }
  let total = 0
  for (let i = 0; i < pickups.length - 1; i++) {
    const leg = haversineKm(pickups[i], pickups[i + 1])
    if (leg === null) {
      return null
    }
    total += leg
  }
  const lastLeg = haversineKm(pickups[pickups.length - 1], dropoff)
  if (lastLeg === null) {
    return null
  }
  return total + lastLeg
}
