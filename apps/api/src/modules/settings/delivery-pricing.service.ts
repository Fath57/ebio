import type { DeliveryQuoteResponse } from './contracts/delivery-pricing.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { computeDeliveryFee, computeRunDistance, groupShopsIntoRuns } from '../../common/delivery-fee'
import { PlatformSettingsService } from './platform-settings.service'

/** Pricing a run: several pickups, a single drop-off point. */
export interface RunQuoteInput {
  supplierIds: string[]
  itemsTotal: number
  isDelivery: boolean
  latitude?: number | null
  longitude?: number | null
}

/** A priced run: its shops, its fee, its pickup spread. */
export interface RunQuote extends DeliveryQuoteResponse {
  supplierIds: string[]
  pickupSpreadKm: number | null
}

/** The pricing of a whole cart: its runs, and their sum. */
export interface CartQuote {
  runs: RunQuote[]
  /** Sum of the fees; null as soon as one run cannot be priced. */
  fee: number | null
  /** Sum of the distances; null as soon as one run is not measurable. */
  distanceKm: number | null
  /** Reason of the blocking run, or of the first one otherwise. */
  reason: DeliveryQuoteResponse['reason']
  maxDistanceKm: number
}

export interface QuoteInput {
  supplierId: string
  itemsTotal: number
  isDelivery: boolean
  latitude?: number | null
  longitude?: number | null
}

/**
 * Prices a delivery for the checkout and for order creation, from the same
 * platform rules, so the fee the buyer sees is the fee that is charged.
 */
@Injectable()
export class DeliveryPricingService {
  constructor(
    private readonly em: EntityManager,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async quote(input: QuoteInput): Promise<DeliveryQuoteResponse> {
    const config = await this.platformSettings.getDeliveryPricing()
    const hasPoint = input.latitude != null && input.longitude != null
    const rows = await this.em.getConnection().execute(
      `SELECT location IS NOT NULL AS has_location,
              CASE WHEN location IS NOT NULL AND ? THEN
                ROUND((ST_Distance(location, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography) / 1000)::numeric, 2)
              END AS distance_km
       FROM suppliers WHERE id = ?`,
      [hasPoint, input.longitude ?? 0, input.latitude ?? 0, input.supplierId],
    ) as Array<{ has_location: boolean, distance_km: string | null }>
    if (rows.length === 0) {
      throw new NotFoundException('Supplier not found')
    }
    const result = computeDeliveryFee(config, {
      isDelivery: input.isDelivery,
      itemsTotal: input.itemsTotal,
      distanceKm: rows[0].distance_km === null ? null : Number(rows[0].distance_km),
      hasShopPosition: rows[0].has_location,
    })
    return {
      mode: config.mode,
      fee: result.fee,
      distanceKm: result.distanceKm,
      reason: result.reason,
      requiresPosition: config.mode !== 'FLAT' && rows[0].has_location,
      maxDistanceKm: config.maxDistanceKm,
      freeFrom: config.freeFrom,
    }
  }

  /**
   * Prices a run: several shops to collect from, one drop-off point.
   *
   * The distance is the courier's real ride — pickup to pickup, then the last
   * pickup to the drop-off — and not the sum of shop → buyer distances, which
   * would count the same road twice. The free-delivery threshold is judged on
   * the whole cart: that is what the buyer sees.
   *
   * Coordinates come out of PostGIS as everywhere else; a single shop without
   * a position is enough to make the distance impossible to compute, and the
   * flat fee then applies without blocking the sale.
   */
  async quoteRun(input: RunQuoteInput): Promise<DeliveryQuoteResponse> {
    const config = await this.platformSettings.getDeliveryPricing()
    const positions = await this.supplierPositions(input.supplierIds)
    const hasAllPositions = input.supplierIds.every(id => positions.get(id) !== undefined)
    const hasDropoff = input.latitude != null && input.longitude != null

    const distanceKm = hasAllPositions && hasDropoff
      ? computeRunDistance(
          input.supplierIds.map(id => positions.get(id)!),
          { latitude: input.latitude!, longitude: input.longitude! },
        )
      : null

    const result = computeDeliveryFee(config, {
      isDelivery: input.isDelivery,
      itemsTotal: input.itemsTotal,
      distanceKm,
      hasShopPosition: hasAllPositions,
    })
    return {
      mode: config.mode,
      fee: result.fee,
      distanceKm: result.distanceKm,
      reason: result.reason,
      requiresPosition: config.mode !== 'FLAT' && hasAllPositions,
      maxDistanceKm: config.maxDistanceKm,
      freeFrom: config.freeFrom,
    }
  }

  /**
   * Splits a cart's shops into runs, then prices each one.
   *
   * Two criteria bound the grouping: the number of shops and the gap between
   * their pickup points. Both are checked here, while the quote is built, and
   * not at dispatch time — a check placed later would come after the money was
   * taken, when nothing can be refused any more.
   *
   * The free-delivery threshold, however, stays judged on the whole cart: that
   * is what the buyer sees, and a cart split into two runs must not lose a
   * waiver it had already earned.
   */
  async quoteCart(input: RunQuoteInput): Promise<CartQuote> {
    const config = await this.platformSettings.getDeliveryPricing()
    const positions = await this.supplierPositions(input.supplierIds)
    const groups = groupShopsIntoRuns(
      input.supplierIds.map(id => ({
        supplierId: id,
        latitude: positions.get(id)?.latitude ?? null,
        longitude: positions.get(id)?.longitude ?? null,
      })),
      config.grouping,
    )

    const runs = []
    for (const group of groups) {
      const quote = await this.quoteRun({ ...input, supplierIds: group.supplierIds })
      runs.push({ ...quote, supplierIds: group.supplierIds, pickupSpreadKm: group.pickupSpreadKm })
    }

    // A single unpriceable run makes the cart unpayable: better to say so with
    // its reason than to announce a total that ignores a run.
    const blocked = runs.find(run => run.fee === null) ?? null
    const totalFee = blocked ? null : runs.reduce((sum, run) => sum + (run.fee ?? 0), 0)
    const totalDistanceKm = runs.every(run => run.distanceKm !== null)
      ? runs.reduce((sum, run) => sum + (run.distanceKm ?? 0), 0)
      : null

    return {
      runs,
      fee: totalFee,
      distanceKm: totalDistanceKm,
      reason: (blocked ?? runs[0])?.reason ?? 'PICKUP',
      maxDistanceKm: config.maxDistanceKm,
    }
  }

  /** Shop coordinates, decoded from the PostGIS geography. */
  private async supplierPositions(supplierIds: string[]): Promise<Map<string, { latitude: number, longitude: number }>> {
    if (supplierIds.length === 0) {
      return new Map()
    }
    const rows = await this.em.getConnection().execute(
      `SELECT id,
              ST_Y(location::geometry) AS latitude,
              ST_X(location::geometry) AS longitude
       FROM suppliers
       WHERE id IN (${supplierIds.map(() => '?').join(', ')}) AND location IS NOT NULL`,
      supplierIds,
    ) as Array<{ id: string, latitude: number | string, longitude: number | string }>
    return new Map(rows.map(row => [row.id, {
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
    }]))
  }

  /** Order creation: a quote that cannot be priced is a refusal, with the reason spelled out. */
  async feeForOrder(input: QuoteInput): Promise<number> {
    const quote = await this.quote(input)
    if (quote.fee !== null) {
      return quote.fee
    }
    if (quote.reason === 'OUT_OF_RANGE') {
      const km = (quote.distanceKm ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })
      throw new BadRequestException(`Adresse hors zone de livraison (${km} km, maximum ${quote.maxDistanceKm} km). Choisissez le retrait sur place ou une autre adresse.`)
    }
    throw new BadRequestException('Choisissez votre point de livraison sur la carte pour calculer les frais de livraison')
  }
}
