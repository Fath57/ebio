/**
 * Pure terroir arithmetic (011, data-model §8): weights in grams, amounts in
 * FCFA. Everything here is deterministic and free of I/O so the money rules
 * can be tested on their own.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Two decimals, so `3.2 × 8 500` does not ceil to one franc too many. */
function cents(value: number): number {
  return Math.round(value * 100) / 100
}

export interface WeightLine {
  /** Packed weight of one unit. */
  weightG: number
  quantity: number
}

/** A departure's terms towards one country. */
export interface RateTerms {
  pricePerKg: number
  minBilledKg: number
  /** Heaviest parcel accepted; null means no limit. */
  maxWeightKg?: number | null
  /** Door delivery surcharge; null means none offered. */
  homeDeliveryFee?: number | null
}

/** Σ weights × quantities, plus the flat packaging — none for an empty cart. */
export function estimateWeight(lines: WeightLine[], packagingG: number): number {
  const items = lines.reduce((total, line) => total + Math.max(0, line.weightG) * Math.max(0, line.quantity), 0)
  return items > 0 ? Math.round(items + packagingG) : 0
}

/** The kilos billed: the weight, never under the minimum. */
export function billedKg(weightG: number, rate: RateTerms): number {
  return Math.max(weightG / 1000, rate.minBilledKg)
}

/** `ceil(max(weightKg, minBilledKg) × pricePerKg)`, to the franc. */
export function shippingPrice(weightG: number, rate: RateTerms): number {
  return Math.ceil(cents(billedKg(weightG, rate) * rate.pricePerKg))
}

/** Kilos that still fit under the minimum billed, at no extra cost (US8). */
export function marginKg(weightG: number, rate: RateTerms): number {
  return Math.max(0, Math.round((rate.minBilledKg - weightG / 1000) * 1000) / 1000)
}

/** `max(value × rate, minimum)`, to the franc above. */
export function insurancePrice(value: number, rateBps: number, minimum: number): number {
  return Math.max(Math.ceil(cents(value * rateBps / 10_000)), minimum)
}

export interface DepartureFacts {
  id: string
  status: string
  /** `YYYY-MM-DD`. */
  departsOn: string
  depositDeadline: Date
  /** Null: no negotiated capacity. */
  capacityKg: number | null
  /** Grams already reserved by paid parcels. */
  reservedG: number
  rates: Array<RateTerms & { country: string }>
}

export interface OfferedDeparture {
  departure: DepartureFacts
  rate: RateTerms & { country: string }
  /** Last moment to order: the deposit deadline minus eBio's collection days. */
  orderBefore: Date
  shippingPrice: number
}

/** When buyers must have ordered for eBio to collect before the agency's deadline. */
export function orderDeadline(depositDeadline: Date, collectionDays: number): Date {
  return new Date(depositDeadline.getTime() - collectionDays * DAY_MS)
}

/**
 * The departures a buyer may pick (FR-010): open, serving the country, not
 * past the order deadline, with room for this parcel and accepting its
 * weight. Soonest first.
 */
export function availableDepartures(
  departures: DepartureFacts[],
  country: string,
  weightG: number,
  now: Date,
  collectionDays: number,
): OfferedDeparture[] {
  const offered: OfferedDeparture[] = []
  for (const departure of departures) {
    if (departure.status !== 'OPEN') {
      continue
    }
    const rate = departure.rates.find(candidate => candidate.country === country)
    if (!rate) {
      continue
    }
    const orderBefore = orderDeadline(departure.depositDeadline, collectionDays)
    if (orderBefore.getTime() <= now.getTime()) {
      continue
    }
    if (rate.maxWeightKg != null && weightG > rate.maxWeightKg * 1000) {
      continue
    }
    if (departure.capacityKg != null && departure.reservedG + weightG > departure.capacityKg * 1000) {
      continue
    }
    offered.push({ departure, rate, orderBefore, shippingPrice: shippingPrice(weightG, rate) })
  }
  return offered.sort((a, b) => a.departure.departsOn.localeCompare(b.departure.departsOn)
    || a.orderBefore.getTime() - b.orderBefore.getTime())
}

/** Share of the capacity reserved, 0–1+ (4 decimals); null without a capacity. */
export function fillRatio(reservedG: number, capacityKg: number | null): number | null {
  if (capacityKg == null || capacityKg <= 0) {
    return null
  }
  return Math.round(reservedG / 1000 / capacityKg * 10_000) / 10_000
}

/** The team is alerted once at 80 %; the departure closes at 100 %. */
export const FILL_ALERT_RATIO = 0.8

/**
 * What a heavier parcel costs on top of what the buyer paid, or null while
 * the gap stays within the tolerance eBio absorbs (FR-020).
 */
export function supplementFor(estimatedG: number, actualG: number, rate: RateTerms, tolerancePct: number): number | null {
  if (actualG <= estimatedG * (1 + tolerancePct / 100)) {
    return null
  }
  const gap = shippingPrice(actualG, rate) - shippingPrice(estimatedG, rate)
  return gap > 0 ? gap : null
}

export interface PackLine {
  productId: string
  variantId: string | null
  supplierId: string
  /** Today's shop price of one unit. */
  unitPrice: number
  quantity: number
}

export interface PackSplit {
  /** Ordinary lines per shop, at shop prices, multiplied by the packs bought. */
  bySupplier: Array<{ supplierId: string, lines: PackLine[], total: number }>
  /** What the packs bought cost at the shops' prices. */
  linesTotal: number
  /** What the buyer pays for the packs. */
  packTotal: number
  /** eBio pack sold under its lines: what eBio pays the shops on top. */
  compensation: number
  /** eBio pack sold above its lines: what eBio keeps. */
  margin: number
  /**
   * Shop pack only: its price minus its lines, signed. Negative is the
   * discount the shop grants itself; positive is the shop's own price above
   * its lines, paid to the shop as well.
   */
  supplierAdjustment: number
}

/**
 * Unfolds `quantity` packs into ordinary lines per shop (research §7). Every
 * shop is paid at its own price; the gap with the pack price is eBio's
 * compensation or margin on an eBio pack, the shop's own adjustment on a
 * shop pack — so the shops, eBio and the buyer always add up.
 */
export function packSplit(pack: { price: number, supplierId: string | null }, lines: PackLine[], quantity = 1): PackSplit {
  const groups = new Map<string, PackLine[]>()
  for (const line of lines) {
    const scaled = { ...line, quantity: line.quantity * quantity }
    groups.set(line.supplierId, [...(groups.get(line.supplierId) ?? []), scaled])
  }
  const bySupplier = [...groups.entries()].map(([supplierId, group]) => ({
    supplierId,
    lines: group,
    total: cents(group.reduce((total, line) => total + line.unitPrice * line.quantity, 0)),
  }))
  const linesTotal = cents(bySupplier.reduce((total, group) => total + group.total, 0))
  const packTotal = cents(pack.price * quantity)
  const difference = cents(packTotal - linesTotal)
  const isEbio = pack.supplierId === null
  return {
    bySupplier,
    linesTotal,
    packTotal,
    compensation: isEbio ? Math.max(0, -difference) : 0,
    margin: isEbio ? Math.max(0, difference) : 0,
    supplierAdjustment: isEbio ? 0 : difference,
  }
}
