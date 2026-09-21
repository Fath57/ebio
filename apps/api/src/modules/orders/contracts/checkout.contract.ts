import { z } from 'zod'
import { deliveryReasonEnum } from '../../settings/contracts/delivery-pricing.contract'
import { orderItemInputSchema, paymentMethodEnum, pickupModeEnum } from './order.contract'

/**
 * The unified checkout: one cart spanning several shops, a single payment, N
 * orders created behind it.
 *
 * No `supplierId` on the way in: the shops are derived from the products. That
 * is the whole point of the feature — splitting becomes the platform's
 * business and stops being the buyer's.
 */

export const checkoutPreviewSchema = z.object({
  items: z.array(orderItemInputSchema).min(1, 'Le panier est vide'),
  pickupMode: pickupModeEnum,
  deliveryLatitude: z.number().min(-90).max(90).optional(),
  deliveryLongitude: z.number().min(-180).max(180).optional(),
  promoCode: z.string().trim().max(50).optional(),
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
}).meta({
  title: 'CheckoutPreviewResponse',
  description: 'Chiffrage d\'un panier multi-boutiques, avant paiement',
})

export const createCheckoutSchema = z.object({
  items: z.array(orderItemInputSchema).min(1, 'Le panier est vide'),
  pickupMode: pickupModeEnum,
  deliveryAddress: z.string().trim().min(10, 'Indiquez le quartier et un repère').max(500).optional(),
  deliveryLatitude: z.number().min(-90).max(90).optional(),
  deliveryLongitude: z.number().min(-180).max(180).optional(),
  paymentMethod: paymentMethodEnum,
  promoCode: z.string().trim().max(50).optional(),
  deliverySlot: z.string().datetime().optional(),
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

export type CheckoutPreview = z.infer<typeof checkoutPreviewSchema>
export type CheckoutPreviewResponse = z.infer<typeof checkoutPreviewResponseSchema>
export type CreateCheckout = z.infer<typeof createCheckoutSchema>
export type CreateCheckoutResponse = z.infer<typeof createCheckoutResponseSchema>
export type CompensateCheckout = z.infer<typeof compensateCheckoutSchema>
