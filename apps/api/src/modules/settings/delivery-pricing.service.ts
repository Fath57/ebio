import type { DeliveryQuoteResponse } from './contracts/delivery-pricing.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { computeDeliveryFee, computeRunDistance } from '../../common/delivery-fee'
import { PlatformSettingsService } from './platform-settings.service'

/** Chiffrage d'une tournée : plusieurs collectes, un seul point de chute. */
export interface RunQuoteInput {
  supplierIds: string[]
  itemsTotal: number
  isDelivery: boolean
  latitude?: number | null
  longitude?: number | null
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
   * Chiffre une tournée : plusieurs boutiques à collecter, un point de chute.
   *
   * La distance est celle du trajet réel du livreur — collecte à collecte,
   * puis dernière collecte au point de chute — et non la somme des distances
   * boutique → acheteur, qui compterait deux fois le même chemin. Le seuil de
   * gratuité s'évalue sur le panier entier : c'est ce que l'acheteur voit.
   *
   * Les coordonnées sortent de PostGIS comme partout ailleurs ; une seule
   * boutique non localisée suffit à rendre la distance incalculable, et le
   * forfait s'applique alors sans bloquer la vente.
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

  /** Coordonnées des boutiques, décodées depuis la géographie PostGIS. */
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
