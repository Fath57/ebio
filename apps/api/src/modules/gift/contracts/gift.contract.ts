import { z } from 'zod'
import { orderStatusEnum } from '../../orders/contracts/order.contract'

// ─── Public tracking (contracts/diaspora.md §5) ──────────────────────────────
//
// Read without an account, from a link sent by SMS: never a price, a code, a
// phone number or a written address, only what the relative needs to wait
// at the door.

export const giftTrackingStatusEnum = z.enum(['PAID', 'PREPARING', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED']).meta({
  title: 'GiftTrackingStatus',
  description: 'Étape du panier envoyé à un proche, vue depuis le lien de suivi public',
})

const geoPointSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
})

export const giftTrackingSchema = z.object({
  payerFirstName: z.string(),
  recipientFirstName: z.string(),
  status: giftTrackingStatusEnum,
  window: z.object({ start: z.string().datetime(), end: z.string().datetime() }).nullable(),
  shops: z.array(z.object({ name: z.string() })),
  lines: z.array(z.object({
    name: z.string(),
    quantity: z.number(),
    imageUrl: z.string().nullable(),
  })),
  /** Only while the courier is on the road with the cart. */
  courierPosition: geoPointSchema.extend({ at: z.string().datetime().nullable() }).nullable(),
  destination: geoPointSchema.nullable(),
  expired: z.literal(false),
}).meta({
  title: 'GiftTracking',
  description: 'Suivi public d\'un panier envoyé à un proche',
})

/** Seven days after the end, the link only says how it ended. */
export const giftTrackingExpiredSchema = z.object({
  status: giftTrackingStatusEnum,
  expired: z.literal(true),
}).meta({
  title: 'GiftTrackingExpired',
  description: 'Lien de suivi expiré : seule l\'issue reste lisible',
})

export const giftTrackingResponseSchema = z.union([giftTrackingSchema, giftTrackingExpiredSchema]).meta({
  title: 'GiftTrackingResponse',
  description: 'Réponse du lien de suivi public',
})

// ─── Received baskets (contracts/diaspora.md §4) ─────────────────────────────

export const receivedOrderSchema = z.object({
  orderId: z.string().uuid(),
  payerFirstName: z.string(),
  /** So the relative can rate the shop through the existing ratings routes. */
  supplierId: z.string().uuid(),
  shopName: z.string(),
  status: orderStatusEnum,
  deliveredAt: z.string().datetime().nullable(),
  lines: z.array(z.object({
    productId: z.string().uuid(),
    name: z.string(),
    quantity: z.number(),
    imageUrl: z.string().nullable(),
  })),
  /** Delivered: the relative may rate the shop, the courier and the products. */
  canReview: z.boolean(),
}).meta({
  title: 'ReceivedOrder',
  description: 'Un panier reçu d\'un proche, sans aucun montant',
})

export const receivedOrdersResponseSchema = z.object({
  items: z.array(receivedOrderSchema),
  total: z.number().int(),
}).meta({
  title: 'ReceivedOrders',
  description: 'Paniers envoyés au numéro vérifié de ce compte',
})

export type GiftTrackingStatus = z.infer<typeof giftTrackingStatusEnum>
export type GiftTracking = z.infer<typeof giftTrackingSchema>
export type GiftTrackingExpired = z.infer<typeof giftTrackingExpiredSchema>
export type GiftTrackingResponse = z.infer<typeof giftTrackingResponseSchema>
export type ReceivedOrder = z.infer<typeof receivedOrderSchema>
export type ReceivedOrdersResponse = z.infer<typeof receivedOrdersResponseSchema>
