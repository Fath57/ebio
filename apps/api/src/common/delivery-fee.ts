/**
 * Single source of truth for what a delivery costs the buyer.
 *
 * Pricing is platform-wide (admin-tuned, see PlatformSettingsService), never
 * per shop: one of three modes, a basket threshold for free delivery, and a
 * hard distance limit. Distances are computed by the caller and passed in.
 *
 * Since the unified cart, that distance is the one of the **whole run** —
 * pickup to pickup, then the last pickup to the drop-off point (see
 * `computeRunDistance`). It is the road the courier actually rides, so the
 * only honest basis for both the fee and their earning. A run with a single
 * shop falls back exactly on the former computation.
 */

export type DeliveryPricingMode = 'FLAT' | 'DISTANCE' | 'ZONES'

export interface DeliveryZone {
  /** Ring outer radius from the shop, km. Rings are sorted ascending. */
  maxKm: number
  fee: number
}

/**
 * How many shops a run gathers, and how far apart they may be.
 *
 * Two criteria, not one. Counting shops says nothing about the ride: what the
 * platform pays for is the kilometre between them, since the buyer settles a
 * single fee. A spread threshold bounds that exposure.
 */
export interface RunGroupingConfig {
  /** Largest number of shops a single run may gather. */
  maxShops: number
  /** Largest gap, in km, between two pickup points of the same run. */
  maxPickupSpreadKm: number
}

export const DEFAULT_RUN_GROUPING: RunGroupingConfig = {
  maxShops: 2,
  maxPickupSpreadKm: 3,
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
  /** How many shops a run gathers, and how far apart they may be. */
  grouping: RunGroupingConfig
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
  grouping: DEFAULT_RUN_GROUPING,
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
   * Items only: the fee never counts toward its own waiver. On a multi-shop
   * cart this is the whole cart total — the free-delivery threshold is judged
   * on what the buyer sees, which is one cart.
   */
  itemsTotal: number
  /** Run distance in km; null when a point is missing. */
  distanceKm: number | null
  /**
   * Every shop of the run has a known position. A single one without it makes
   * the distance impossible to compute: the flat fee applies and the order
   * still goes through (`NO_SHOP_POSITION` is not blocking).
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

/** A point of the run: a shop to collect from, or the drop-off. */
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
 * Distance of a run: pickup to pickup in visiting order, then the last pickup
 * to the drop-off point.
 *
 * This is the courier's real ride, not the sum of shop → buyer distances: two
 * neighbouring shops must not be charged twice for the same road. A single
 * shop gives back the shop → buyer distance, hence the behaviour from before
 * the unified cart.
 *
 * Returns `null` as soon as a point is missing: the distance would be
 * meaningless, and `computeDeliveryFee` falls back on the flat fee.
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

/** A shop to collect from, as PostGIS knows it. */
export interface GroupableShop {
  supplierId: string
  latitude: number | null
  longitude: number | null
}

/** A run being planned: its shops, and the gap between them. */
export interface ShopGroup {
  supplierIds: string[]
  /** Widest gap between two pickups; 0 for a lone shop, null when a position is missing. */
  pickupSpreadKm: number | null
}

/** Widest gap between two shops of the batch, or null when one has no position. */
function widestSpread(shops: GroupableShop[]): number | null {
  let widest = 0
  for (let i = 0; i < shops.length; i++) {
    for (let j = i + 1; j < shops.length; j++) {
      const gap = haversineKm(shops[i], shops[j])
      if (gap === null) {
        return null
      }
      widest = Math.max(widest, gap)
    }
  }
  return widest
}

/**
 * Splits the shops of a cart into runs.
 *
 * Two rules, enforced here and nowhere else — a check placed later, at
 * dispatch time, would come after the money was taken:
 *
 * 1. A shop with no known position cannot be grouped. Its gap cannot be
 *    measured, and the flat fee that then applies does not cover an unknown
 *    detour: it gets a run of its own.
 * 2. Two shops only join if **every** pair of the batch stays under the spread
 *    threshold. With two shops per run there is a single pair, but the
 *    threshold must still hold if the limit is raised.
 *
 * The walk is greedy and deterministic: start from the north-westmost
 * remaining shop, add the closest one that respects the threshold, repeat. The
 * optimum is not sought — it would cost dearly for a cart that rarely holds
 * more than three shops, and the count limit already bounds the possible gain.
 */
export function groupShopsIntoRuns(shops: GroupableShop[], config: RunGroupingConfig): ShopGroup[] {
  const maxShops = Math.max(1, Math.floor(config.maxShops))
  const groups: ShopGroup[] = []

  const located: GroupableShop[] = []
  for (const shop of shops) {
    if (shop.latitude === null || shop.longitude === null) {
      groups.push({ supplierIds: [shop.supplierId], pickupSpreadKm: null })
    }
    else {
      located.push(shop)
    }
  }

  // Stable order: position first, id to break ties, so that the same cart
  // always yields the same split.
  const remaining = [...located].sort((a, b) => (
    b.latitude! - a.latitude! || a.longitude! - b.longitude! || a.supplierId.localeCompare(b.supplierId)
  ))

  while (remaining.length > 0) {
    const group = [remaining.shift()!]
    while (group.length < maxShops) {
      let bestIndex = -1
      let bestSpread = Number.POSITIVE_INFINITY
      for (const [index, candidate] of remaining.entries()) {
        const spread = widestSpread([...group, candidate])
        if (spread !== null && spread <= config.maxPickupSpreadKm && spread < bestSpread) {
          bestIndex = index
          bestSpread = spread
        }
      }
      if (bestIndex === -1) {
        break
      }
      group.push(remaining.splice(bestIndex, 1)[0])
    }
    groups.push({
      supplierIds: group.map(shop => shop.supplierId),
      pickupSpreadKm: widestSpread(group),
    })
  }

  return groups
}

/** A pickup to order: its id and its point. */
export interface PickupStop extends RunPoint {
  id: string
}

/**
 * Visiting order of a run: closest to the courier first, then step by step.
 *
 * That rule minimises the first shop's wait, and it is the one couriers find
 * natural — they start with what is at hand. The resulting ride is not always
 * the shortest possible, but with two or three pickups the difference is
 * negligible, and a counter-intuitive order costs more in refusals than it
 * saves in kilometres.
 *
 * While no courier has accepted, `origin` is null: the shop farthest from the
 * drop-off then comes first, so that the last leg — the one carrying every
 * shop's goods — is the shortest. That order is provisional and is recomputed
 * on acceptance.
 */
export function orderPickups(stops: PickupStop[], origin: RunPoint | null, dropoff: RunPoint): string[] {
  if (stops.length <= 1) {
    return stops.map(stop => stop.id)
  }

  const remaining = [...stops]
  const ordered: string[] = []

  if (origin === null) {
    remaining.sort((a, b) => {
      const da = haversineKm(a, dropoff)
      const db = haversineKm(b, dropoff)
      // A shop without a position goes last: there is no way to place it.
      if (da === null || db === null) {
        return (da === null ? 1 : 0) - (db === null ? 1 : 0) || a.id.localeCompare(b.id)
      }
      return db - da || a.id.localeCompare(b.id)
    })
    return remaining.map(stop => stop.id)
  }

  let from: RunPoint = origin
  while (remaining.length > 0) {
    let bestIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY
    for (const [index, stop] of remaining.entries()) {
      const distance = haversineKm(from, stop)
      // A pickup whose position is unknown cannot be "the closest": it waits
      // until the others are placed.
      const value = distance === null ? Number.POSITIVE_INFINITY : distance
      if (value < bestDistance) {
        bestIndex = index
        bestDistance = value
      }
    }
    const [next] = remaining.splice(bestIndex, 1)
    ordered.push(next.id)
    from = next
  }
  return ordered
}
