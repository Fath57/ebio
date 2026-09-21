import { z } from 'zod'

/**
 * La tournée : plusieurs collectes, une remise, un seul livreur.
 *
 * La décision du livreur porte sur la tournée entière — il n'y a pas
 * d'acceptation partielle. La collecte, elle, reste boutique par boutique :
 * chaque commande passe en « récupérée » à son propre point.
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
  /** Passe à true dès que le livreur a collecté chez cette boutique. */
  collected: z.boolean(),
}).meta({ title: 'RunPickup' })

export const offeredRunSchema = z.object({
  runId: z.string().uuid(),
  checkoutId: z.string().uuid(),
  shopCount: z.number().int().positive(),
  totalDistanceKm: z.number().nullable(),
  /** Rémunération de la tournée, et non par commande transportée. */
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
  /** Le code de l'acheteur, un seul pour toute la tournée. */
  code: z.string().regex(/^\d{4}$/, 'Le code comporte 4 chiffres'),
}).meta({ title: 'DeliverRun' })

export const deliverRunResponseSchema = z.object({
  runStatus: deliveryRunStatusEnum,
  /** Toutes les commandes de la tournée, passées en « livrée » d'un geste. */
  orders: z.array(z.object({
    orderId: z.string().uuid(),
    status: z.string(),
  })),
}).meta({ title: 'DeliverRunResponse' })

/**
 * Ce que l'acheteur répond quand aucun livreur n'a pris la tournée au bout de
 * 30 minutes. Annuler crédite l'intégralité du montant, frais compris.
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
