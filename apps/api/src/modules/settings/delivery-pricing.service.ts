import type { DeliveryQuoteResponse } from './contracts/delivery-pricing.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { computeDeliveryFee, computeRunDistance, groupShopsIntoRuns } from '../../common/delivery-fee'
import { PlatformSettingsService } from './platform-settings.service'

/** Chiffrage d'une tournée : plusieurs collectes, un seul point de chute. */
export interface RunQuoteInput {
  supplierIds: string[]
  itemsTotal: number
  isDelivery: boolean
  latitude?: number | null
  longitude?: number | null
}

/** Une tournée chiffrée : ses boutiques, son frais, son écart de collecte. */
export interface RunQuote extends DeliveryQuoteResponse {
  supplierIds: string[]
  pickupSpreadKm: number | null
}

/** Le chiffrage d'un panier entier : ses tournées, et leur somme. */
export interface CartQuote {
  runs: RunQuote[]
  /** Somme des frais ; null dès qu'une tournée ne peut pas être chiffrée. */
  fee: number | null
  /** Somme des distances ; null dès qu'une tournée n'est pas mesurable. */
  distanceKm: number | null
  /** Motif de la tournée bloquante, ou de la première à défaut. */
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

  /**
   * Découpe les boutiques d'un panier en tournées, puis chiffre chacune.
   *
   * Deux critères bornent le regroupement : le nombre de boutiques et l'écart
   * entre leurs points de collecte. Ils se vérifient ici, à la constitution du
   * devis, et non à la diffusion — un contrôle posé plus tard arriverait après
   * l'encaissement, quand il n'est plus possible de refuser quoi que ce soit.
   *
   * Le seuil de gratuité, lui, reste évalué sur le panier entier : c'est ce
   * que l'acheteur voit, et un panier découpé en deux tournées ne doit pas
   * perdre une gratuité déjà acquise.
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

    // Un seul chiffrage impossible rend le panier impayable : mieux vaut le
    // dire avec son motif que d'annoncer un total qui ignore une tournée.
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
