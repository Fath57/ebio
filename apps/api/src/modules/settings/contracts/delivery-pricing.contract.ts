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
   * Grouping of shops into runs. The defaults cover a configuration written
   * before these thresholds existed.
   *
   * `maxPickupSpreadKm` is capped by `maxDistanceKm` — checked below: grouping
   * two shops farther apart than we deliver would make no sense.
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
 * Why the delivery costs what it costs — or why it cannot be priced. Mirrors
 * `DeliveryFeeReason` (common/delivery-fee.ts).
 *
 * `NO_SHOP_POSITION` is not blocking: the flat fee applies and the order goes
 * through. Only `NO_POSITION`, which points at the buyer, is.
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

/**
 * The assistant's switch.
 *
 * An object rather than a bare boolean: a request body reads better that way,
 * and the setting can gain a field — a list of buyers, a spending cap —
 * without breaking its callers.
 */
export const assistantSettingSchema = z.object({
  enabled: z.boolean(),
  /**
   * The name she answers to.
   *
   * It reaches her own prompt, so it is bounded and kept to plain characters:
   * a name is a name, not a place to slip a second set of instructions. The
   * range is written out rather than using `\p{L}`: the pattern travels to the
   * generated client through JSON Schema, which carries no flags, and the
   * rebuilt expression would not compile without `u`.
   */
  name: z.string().trim().min(2).max(30).regex(/^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF][A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF '’-]*$/, {
    message: 'Le nom ne peut contenir que des lettres, espaces, apostrophes et traits d\'union',
  }).optional(),
  /** Her portrait. `null` puts back the one shipped with the app. */
  avatarUrl: z.string().url().nullable().optional(),
  /**
   * How fast she speaks, as a multiplier.
   *
   * Adjustable because the right pace is a matter of ear, not of doctrine.
   * The default was chosen on measurement — four readings of the same
   * sentence averaged 7.76 s at the original setting against 6.66 s — and the
   * range is left wide because 14 % may not be enough for everyone.
   */
  voiceSpeed: z.number().min(0.8).max(1.4).optional(),
}).meta({
  title: 'AssistantSetting',
  description: 'Ouvrir ou fermer l\'assistant conversationnel, et régler son identité',
})

export type AssistantSettingInput = z.infer<typeof assistantSettingSchema>

/** The name and face the apps show, resolved. */
export const assistantIdentitySchema = z.object({
  name: z.string(),
  avatarUrl: z.string().nullable(),
  /** Speech rate multiplier; defaulted so rows saved before it still parse. */
  voiceSpeed: z.number().min(0.8).max(1.4).default(1.15),
}).meta({
  title: 'AssistantIdentity',
  description: 'Le nom et le portrait de l\'assistante',
})

export type AssistantIdentity = z.infer<typeof assistantIdentitySchema>

/**
 * When to ask for product reviews, and how many times to remind.
 *
 * The delay runs from the delivery for the first invitation, then from the
 * previous one for each reminder: a single number to understand.
 */
export const productReviewTimingSchema = z.object({
  delaiHeures: z.coerce.number().int().min(1).max(720),
  relancesMaximum: z.coerce.number().int().min(1).max(10),
}).meta({
  title: 'ProductReviewTiming',
  description: 'Délai et relances de la demande d\'avis produit',
})

export type ProductReviewTimingInput = z.infer<typeof productReviewTimingSchema>
