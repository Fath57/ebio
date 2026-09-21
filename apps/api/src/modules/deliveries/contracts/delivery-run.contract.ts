import { z } from 'zod'

/**
 * The run: several pickups, one handover, a single courier.
 *
 * The courier's decision covers the whole run — there is no
 * partial acceptance. The pickup, however, stays shop by shop:
 * each order turns "picked up" at its own point.
 */

export const deliveryRunStatusEnum = z.enum([
  'AWAITING_COURIER',
  'ESCALATED',
  'BUYER_DECISION',
  'ACCEPTED',
  'COLLECTING',
  'DELIVERING',
  'DELIVERED',
  'CANCELLED',
]).meta({
  title: 'DeliveryRunStatus',
  description: 'État d\'une tournée de livraison',
})

export const runPickupSchema = z.object({
  deliveryId: z.string().uuid(),
  orderNumber: z.string(),
  shopName: z.string(),
  address: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  /** Turns true as soon as the courier has collected from this shop. */
  collected: z.boolean(),
}).meta({ title: 'RunPickup' })

export const offeredRunSchema = z.object({
  runId: z.string().uuid(),
  checkoutId: z.string().uuid(),
  shopCount: z.number().int().positive(),
  totalDistanceKm: z.number().nullable(),
  /** Pay for the run, and not per order carried. */
  earning: z.number(),
  /** Points de collecte, dans l'ordre de passage. */
  pickups: z.array(runPickupSchema).min(1),
  dropoff: z.object({
    address: z.string().nullable(),
    latitude: z.number(),
    longitude: z.number(),
  }),
  offerExpiresAt: z.string().datetime().nullable(),
}).meta({
  title: 'OfferedRun',
  description: 'Tournée proposée au livreur',
})

export const respondToRunSchema = z.object({
  response: z.enum(['ACCEPT', 'REFUSE']),
}).meta({
  title: 'RespondToRun',
  description: 'La décision porte sur toute la tournée, jamais sur une partie',
})

export const collectDeliveryResponseSchema = z.object({
  deliveryStatus: z.string(),
  runStatus: deliveryRunStatusEnum,
  /** Ce qu'il reste à collecter avant de pouvoir livrer. */
  remainingPickups: z.number().int().min(0),
}).meta({ title: 'CollectDeliveryResponse' })

export const deliverRunSchema = z.object({
  /** The buyer's code, a single one for the whole run. */
  code: z.string().regex(/^\d{4}$/, 'Le code comporte 4 chiffres'),
}).meta({ title: 'DeliverRun' })

export const deliverRunResponseSchema = z.object({
  runStatus: deliveryRunStatusEnum,
  /** Every order of the run, turned "delivered" in one gesture. */
  orders: z.array(z.object({
    orderId: z.string().uuid(),
    status: z.string(),
  })),
}).meta({ title: 'DeliverRunResponse' })

/**
 * What the buyer answers when no courier has taken the run after
 * 30 minutes. Cancelling credits the full amount, fee included.
 */
export const buyerRunDecisionSchema = z.object({
  decision: z.enum(['WAIT', 'CANCEL']),
}).meta({
  title: 'BuyerRunDecision',
  description: 'Attendre encore, ou annuler faute de livreur',
})

export type OfferedRun = z.infer<typeof offeredRunSchema>
export type RespondToRun = z.infer<typeof respondToRunSchema>
export type DeliverRun = z.infer<typeof deliverRunSchema>
export type BuyerRunDecision = z.infer<typeof buyerRunDecisionSchema>
