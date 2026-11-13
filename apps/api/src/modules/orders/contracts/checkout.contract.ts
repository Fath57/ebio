import { z } from 'zod'
import { displayCurrencyEnum } from '../../currency/contracts/currency.contract'
import { deliveryReasonEnum } from '../../settings/contracts/delivery-pricing.contract'
import { deliveryAddressSchema, orderItemInputSchema, paymentMethodEnum, pickupModeEnum } from './order.contract'

/**
 * The unified checkout: one cart spanning several shops, a single payment, N
 * orders created behind it.
 *
 * No `supplierId` on the way in: the shops are derived from the products. That
 * is the whole point of the feature — splitting becomes the platform's
 * business and stops being the buyer's.
 */

/** Below this, the card gateway refuses the payment (INTRAM minimum). */
export const GIFT_MINIMUM_TOTAL = 1000

/** Accepted IANA zones; UTC is not in the list but a device may report it. */
const TIME_ZONES = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC'])

/**
 * The relative a cart is delivered to. Absent means « Me livrer ». The
 * address and the point on the map are the checkout's own fields: with a
 * recipient, they are the relative's.
 */
export const checkoutRecipientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().regex(/^\+229\d{10}$/, 'Le numéro du proche doit être un numéro béninois (+229 suivi de 10 chiffres)'),
  /** Picked from the address book; checked against the payer server side. */
  savedRelativeId: z.string().uuid().optional(),
}).meta({
  title: 'CheckoutRecipient',
  description: 'Le proche à qui le panier est livré',
})

/** IANA zone of the payer's device, to tell them the hand-over time in their own hour. */
export const payerTimeZoneSchema = z.string().trim().max(64).refine(zone => TIME_ZONES.has(zone), {
  message: 'Fuseau horaire inconnu',
})

export const checkoutPreviewSchema = z.object({
  items: z.array(orderItemInputSchema).min(1, 'Le panier est vide'),
  pickupMode: pickupModeEnum,
  deliveryLatitude: z.number().min(-90).max(90).optional(),
  deliveryLongitude: z.number().min(-180).max(180).optional(),
  promoCode: z.string().trim().max(50).optional(),
  recipient: checkoutRecipientSchema.optional(),
  displayCurrency: displayCurrencyEnum.default('XOF'),
  payerTimeZone: payerTimeZoneSchema.optional(),
}).meta({
  title: 'CheckoutPreview',
  description: 'Demande de chiffrage d\'un panier multi-boutiques',
})

/** What one shop amounts to in the cart, for display. */
export const checkoutSupplierBlockSchema = z.object({
  supplierId: z.string().uuid(),
  shopName: z.string(),
  lines: z.array(z.object({
    productId: z.string().uuid(),
    variantId: z.string().uuid().nullable(),
    name: z.string(),
    quantity: z.number().int().positive(),
    unitPrice: z.number(),
    regularPrice: z.number(),
    isGift: z.boolean(),
  })),
  itemsTotal: z.number(),
  /** Set when this shop, and it alone, blocks the checkout. */
  blocked: z.enum(['OUT_OF_RANGE', 'CLOSED', 'OUT_OF_STOCK']).nullable(),
}).meta({ title: 'CheckoutSupplierBlock' })

/**
 * One run of the cart. A cart with two nearby shops yields one; past two
 * shops, or past the admitted gap between them, it yields several, each with
 * its own fee.
 */
export const checkoutRunBlockSchema = z.object({
  supplierIds: z.array(z.string().uuid()).min(1),
  fee: z.number().nullable(),
  reason: deliveryReasonEnum,
  distanceKm: z.number().nullable(),
  /** Gap between the two farthest pickups; null when a position is missing. */
  pickupSpreadKm: z.number().nullable(),
}).meta({ title: 'CheckoutRunBlock' })

/**
 * The amounts in the payer's display currency. Only what is read: the
 * amount collected is always the FCFA total.
 */
export const checkoutDisplaySchema = z.object({
  currency: displayCurrencyEnum,
  /** FCFA for one unit, margin included. */
  rate: z.number(),
  total: z.number(),
  itemsTotal: z.number(),
  deliveryFee: z.number(),
  discount: z.number(),
}).meta({
  title: 'CheckoutDisplay',
  description: 'Montants convertis dans la devise d\'affichage ; le paiement reste en FCFA',
})

export const checkoutPreviewResponseSchema = z.object({
  suppliers: z.array(checkoutSupplierBlockSchema),
  itemsTotal: z.number(),
  discount: z.number(),
  /**
   * Total delivery fee of the cart, across every run. A single figure: the
   * split into runs is the platform's business, and the buyer should not have
   * to understand it to know what they pay.
   */
  deliveryFee: z.number().nullable(),
  deliveryReason: deliveryReasonEnum,
  /** Cumulated distance of the runs, pickups included. */
  deliveryDistanceKm: z.number().nullable(),
  /** The breakdown, for the back-office and tracking. Empty on pickup. */
  runs: z.array(checkoutRunBlockSchema),
  total: z.number(),
  /**
   * By how much the cart exceeds the cash cap, when it does. The cap bounds
   * what the courier fronts, so it covers the whole run and not each order.
   */
  cashLimitExceededBy: z.number().nullable(),
  /**
   * Name of a shop that cannot be paid in cash right now — its eBio debt is
   * past the platform limit — or `null`. Online and wallet stay open.
   */
  cashBlockedShop: z.string().nullable(),
  /**
   * The shop is closed right now — `null` when it is open.
   *
   * Read by the checkout screen above the button: the order is still
   * possible, but it is no longer placed unknowingly.
   */
  closedShop: z.object({
    shopName: z.string(),
    /** "demain à 08:00", or `null` when the schedule cannot say. */
    opensAt: z.string().nullable(),
  }).nullable(),
  /** Null when shown in FCFA, or when the currency has no rate yet. */
  display: checkoutDisplaySchema.nullable(),
  /** A cart for a relative below the card minimum (1 000 FCFA): it cannot be paid. */
  cardMinimumNotMet: z.boolean(),
}).meta({
  title: 'CheckoutPreviewResponse',
  description: 'Chiffrage d\'un panier multi-boutiques, avant paiement',
})

export const createCheckoutSchema = z.object({
  items: z.array(orderItemInputSchema).min(1, 'Le panier est vide'),
  pickupMode: pickupModeEnum,
  deliveryAddress: deliveryAddressSchema.optional(),
  deliveryLatitude: z.number().min(-90).max(90).optional(),
  deliveryLongitude: z.number().min(-180).max(180).optional(),
  paymentMethod: paymentMethodEnum,
  promoCode: z.string().trim().max(50).optional(),
  /**
   * What the buyer types, in their own words — « Demain matin entre 8h et
   * 12h ». Not a timestamp: the column is text, the entity declares a string,
   * and the single-order contract has always taken one. Only this schema
   * asked for an ISO datetime, so any cart where the buyer filled the slot
   * was refused.
   */
  deliverySlot: z.string().trim().max(200).optional(),
  /** Window chosen in the app; without it the slot text is read as a fallback. */
  deliveryWindowStart: z.string().datetime({ offset: true }).optional(),
  deliveryWindowEnd: z.string().datetime({ offset: true }).optional(),
  recipient: checkoutRecipientSchema.optional(),
  /** Only the currency: the server computes and freezes the rate itself. */
  displayCurrency: displayCurrencyEnum.default('XOF'),
  payerTimeZone: payerTimeZoneSchema.optional(),
}).meta({
  title: 'CreateCheckout',
  description: 'Valide un panier multi-boutiques en une seule opération',
})

export const createCheckoutResponseSchema = z.object({
  checkoutId: z.string().uuid(),
  orders: z.array(z.object({
    orderId: z.string().uuid(),
    orderNumber: z.string(),
    supplierId: z.string().uuid(),
    shopName: z.string(),
    total: z.number(),
  })).min(1),
  /**
   * The runs opened by this checkout, in split order. Empty on an on-site
   * pickup: there is nothing to group.
   */
  deliveryRunIds: z.array(z.string().uuid()),
  /** Delivered to a relative rather than to the payer. */
  isGift: z.boolean(),
  /** The conversion frozen on the checkout; null in FCFA. */
  display: checkoutDisplaySchema.nullable(),
}).meta({
  title: 'CreateCheckoutResponse',
  description: 'Le passage en caisse et les commandes qu\'il a créées',
})

/** Compensation for a refused or cancelled order. Internal use. */
export const compensateCheckoutSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
}).meta({
  title: 'CompensateCheckout',
  description: 'Crédite le portefeuille eBio de l\'acheteur pour une commande perdue',
})

export type CheckoutRecipient = z.infer<typeof checkoutRecipientSchema>
export type CheckoutDisplay = z.infer<typeof checkoutDisplaySchema>
export type CheckoutPreview = z.infer<typeof checkoutPreviewSchema>
export type CheckoutPreviewResponse = z.infer<typeof checkoutPreviewResponseSchema>
export type CreateCheckout = z.infer<typeof createCheckoutSchema>
export type CreateCheckoutResponse = z.infer<typeof createCheckoutResponseSchema>
export type CompensateCheckout = z.infer<typeof compensateCheckoutSchema>
