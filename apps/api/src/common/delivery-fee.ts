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

/**
 * Combien de boutiques une tournée réunit, et jusqu'à quelle distance.
 *
 * Deux critères, pas un. Compter les boutiques ne dit rien du trajet : ce que
 * la plateforme paie, c'est le kilomètre entre elles, puisque l'acheteur ne
 * règle qu'un frais unique. Un seuil d'écart borne cette exposition.
 */
export interface RunGroupingConfig {
  /** Nombre maximal de boutiques dans une tournée. */
  maxShops: number
  /** Écart maximal, en km, entre deux points de collecte d'une même tournée. */
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
  /** Combien de boutiques une tournée réunit, et jusqu'à quel écart. */
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

/** Une boutique à collecter, telle que PostGIS la connaît. */
export interface GroupableShop {
  supplierId: string
  latitude: number | null
  longitude: number | null
}

/** Une tournée en projet : ses boutiques, et l'écart qui les sépare. */
export interface ShopGroup {
  supplierIds: string[]
  /** Plus grand écart entre deux collectes ; 0 pour une boutique seule, null si une position manque. */
  pickupSpreadKm: number | null
}

/** Le plus grand écart entre deux boutiques du lot, ou null si l'une n'est pas située. */
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
 * Répartit les boutiques d'un panier en tournées.
 *
 * Deux règles, vérifiées ici et nulle part ailleurs — un contrôle posé plus
 * tard, à la diffusion, arriverait après l'encaissement :
 *
 * 1. Une boutique sans position connue n'est pas groupable. Son écart n'est
 *    pas mesurable, et le forfait qui s'applique alors ne couvre pas un détour
 *    inconnu : elle prend sa propre tournée.
 * 2. Deux boutiques ne se rejoignent que si **toutes** les paires du lot
 *    restent sous le seuil d'écart. Avec deux boutiques par tournée il n'y a
 *    qu'une paire, mais le seuil doit tenir si la limite est relevée.
 *
 * Le parcours est glouton et déterministe : on part de la boutique restante la
 * plus au nord-ouest, on lui adjoint la plus proche qui respecte le seuil, et
 * on recommence. L'optimum n'est pas recherché — il coûterait cher pour un
 * panier qui compte rarement plus de trois boutiques, et la limite de nombre
 * borne déjà le gain possible.
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

  // Ordre stable : la position d'abord, l'identifiant pour départager, afin
  // qu'un même panier produise toujours le même découpage.
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
