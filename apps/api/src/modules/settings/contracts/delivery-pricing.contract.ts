import { z } from 'zod'

export const deliveryPricingModeEnum = z.enum(['FLAT', 'DISTANCE', 'ZONES']).meta({
  title: 'DeliveryPricingMode',
  description: 'How the platform prices a delivery: one fee, base + per-km, or distance rings',
})

const fee = z.number().int().min(0).max(1_000_000)

export const deliveryPricingConfigSchema = z.object({
  mode: deliveryPricingModeEnum,
  flat: z.object({ fee }),
  distance: z.object({
    baseFee: fee,
    perKm: fee,
    minFee: fee,
    maxFee: fee,
    roundTo: z.number().int().min(1).max(10_000),
  }),
  zones: z.array(z.object({
    maxKm: z.number().min(0.1).max(500),
    fee,
  })).min(1).max(10),
  /** Items subtotal above which delivery is free; null disables. */
  freeFrom: z.number().int().min(0).nullable(),
  maxDistanceKm: z.number().min(0.5).max(500),
  /**
   * Regroupement des boutiques en tournées. Les valeurs par défaut valent pour
   * une configuration écrite avant que ces seuils n'existent.
   *
   * `maxPickupSpreadKm` est plafonné par `maxDistanceKm` — vérifié plus bas :
   * grouper deux boutiques plus éloignées qu'on ne livre n'aurait pas de sens.
   */
  grouping: z.object({
    maxShops: z.number().int().min(1).max(5),
    maxPickupSpreadKm: z.number().min(0.1).max(500),
  }).default({ maxShops: 2, maxPickupSpreadKm: 3 }),
}).refine(c => c.distance.minFee <= c.distance.maxFee, { message: 'Le plancher doit être inférieur ou égal au plafond', path: ['distance', 'minFee'] }).refine(c => c.grouping.maxPickupSpreadKm <= c.maxDistanceKm, { message: 'L\'écart entre boutiques ne peut pas dépasser le rayon de livraison', path: ['grouping', 'maxPickupSpreadKm'] }).meta({
  title: 'DeliveryPricingConfig',
  description: 'Platform-wide delivery pricing rules (admin-tuned)',
})

export const deliveryQuoteRequestSchema = z.object({
  supplierId: z.string().uuid(),
  /** Items subtotal, for the free-delivery threshold. */
  itemsTotal: z.number().min(0),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
}).meta({
  title: 'DeliveryQuoteRequest',
  description: 'What the buyer would pay to have this basket delivered to this point',
})

/**
 * Pourquoi la livraison coûte ce qu'elle coûte — ou pourquoi elle ne peut pas
 * être chiffrée. Reflet de `DeliveryFeeReason` (common/delivery-fee.ts).
 *
 * `NO_SHOP_POSITION` n'est pas bloquant : le forfait s'applique et la commande
 * passe. Seul `NO_POSITION`, qui désigne l'acheteur, l'est.
 */
export const deliveryReasonEnum = z.enum([
  'PICKUP',
  'FREE_THRESHOLD',
  'FLAT',
  'DISTANCE',
  'ZONE',
  'NO_POSITION',
  'NO_SHOP_POSITION',
  'OUT_OF_RANGE',
]).meta({
  title: 'DeliveryReason',
  description: 'Motif du tarif de livraison retenu',
})

export const deliveryQuoteResponseSchema = z.object({
  mode: deliveryPricingModeEnum,
  /** Null when the delivery cannot be priced (see reason). */
  fee: z.number().nullable(),
  distanceKm: z.number().nullable(),
  reason: deliveryReasonEnum,
  /** True when the buyer must pick a drop-off point before a fee can be shown. */
  requiresPosition: z.boolean(),
  maxDistanceKm: z.number(),
  freeFrom: z.number().nullable(),
}).meta({
  title: 'DeliveryQuoteResponse',
  description: 'Delivery fee quote for the checkout',
})

export const bannerOffersSchema = z.object({
  /** Sellable slots: duration and price, sorted by duration. */
  offers: z.array(z.object({
    days: z.number().int().min(1).max(365),
    price: z.number().int().min(0).max(10_000_000),
  })).min(1).max(6),
  /** How many of the carousel's slots may be sponsored at once. */
  paidSlots: z.number().int().min(0).max(5),
}).meta({
  title: 'BannerOffers',
  description: 'Sponsored banner offers (duration / price) and paid slot count',
})
export type BannerOffersInput = z.infer<typeof bannerOffersSchema>

export type DeliveryPricingConfigInput = z.infer<typeof deliveryPricingConfigSchema>
export type DeliveryQuoteRequest = z.infer<typeof deliveryQuoteRequestSchema>
export type DeliveryQuoteResponse = z.infer<typeof deliveryQuoteResponseSchema>
