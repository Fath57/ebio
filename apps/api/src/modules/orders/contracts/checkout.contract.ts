import { z } from 'zod'
import { deliveryReasonEnum } from '../../settings/contracts/delivery-pricing.contract'
import { orderItemInputSchema, paymentMethodEnum, pickupModeEnum } from './order.contract'

/**
 * Le passage en caisse unifié : un panier qui couvre plusieurs boutiques,
 * un seul paiement, N commandes créées derrière.
 *
 * Aucun `supplierId` en entrée : les boutiques se déduisent des produits.
 * C'est tout l'objet de la fonctionnalité — la répartition devient l'affaire
 * de la plateforme et cesse d'être celle de l'acheteur.
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

/** Ce qu'une boutique représente dans le panier, pour l'affichage. */
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
  /** Renseigné quand cette boutique, et elle seule, empêche la validation. */
  blocked: z.enum(['OUT_OF_RANGE', 'CLOSED', 'OUT_OF_STOCK']).nullable(),
}).meta({ title: 'CheckoutSupplierBlock' })

export const checkoutPreviewResponseSchema = z.object({
  suppliers: z.array(checkoutSupplierBlockSchema),
  itemsTotal: z.number(),
  discount: z.number(),
  /** Frais uniques de la tournée, pas la somme des frais par boutique. */
  deliveryFee: z.number().nullable(),
  deliveryReason: deliveryReasonEnum,
  /** Distance de la tournée complète, collectes comprises. */
  deliveryDistanceKm: z.number().nullable(),
  total: z.number(),
  /**
   * De combien le panier dépasse le plafond des espèces, le cas échéant. Le
   * plafond borne ce que le livreur avance, donc il porte sur la tournée
   * entière et non sur chaque commande.
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
  /** Absent en retrait sur place : aucune tournée n'est créée. */
  deliveryRunId: z.string().uuid().nullable(),
}).meta({
  title: 'CreateCheckoutResponse',
  description: 'Le passage en caisse et les commandes qu\'il a créées',
})

/** Dédommagement d'une commande refusée ou annulée. Usage interne. */
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
