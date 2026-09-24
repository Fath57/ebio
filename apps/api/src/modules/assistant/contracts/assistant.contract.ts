import { z } from 'zod'

export const assistantTurnSchema = z.object({
  /** Absent au premier tour : le serveur ouvre alors la conversation. */
  sessionId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(1000),
}).meta({
  title: 'AssistantTurn',
  description: 'Un tour de parole avec l\'assistant',
})

const cartLineSchema = z.object({
  productId: z.string().uuid(),
  name: z.string(),
  supplierId: z.string().uuid(),
  supplierName: z.string(),
  quantity: z.number().int(),
  pricePerUnit: z.number(),
  unit: z.string(),
  imageUrl: z.string().nullable(),
})

export const assistantTurnResponseSchema = z.object({
  sessionId: z.string().uuid(),
  reply: z.string(),
  /**
   * Le panier construit par la conversation. L'application le reprend : eBio
   * n'a pas encore de panier côté serveur, et celui-ci le remplacera le jour
   * où il y en aura un.
   */
  cart: z.array(cartLineSchema),
}).meta({
  title: 'AssistantTurnResponse',
  description: 'La réponse de l\'assistant et l\'état du panier',
})

/**
 * Une correction à la main, pendant que la conversation continue.
 *
 * `quantite` à zéro retire la ligne. L'acheteur corrige sans avoir à le dire
 * à voix haute : c'est plus rapide de toucher que d'expliquer.
 */
export const assistantCartLineSchema = z.object({
  produitId: z.string().uuid(),
  quantite: z.number().int().min(0).max(999),
}).meta({
  title: 'AssistantCartAdjustment',
  description: 'Corriger une ligne du panier de la conversation',
})

/** Le texte à dire. Borné : au-delà, ce n'est plus un tour de parole. */
export const assistantSpeakSchema = z.object({
  texte: z.string().trim().min(1).max(2000),
}).meta({
  title: 'AssistantSpeak',
  description: 'Faire dire une réponse à voix haute',
})

export type AssistantSpeakInput = z.infer<typeof assistantSpeakSchema>
export type AssistantTurnInput = z.infer<typeof assistantTurnSchema>
export type AssistantCartLineInput = z.infer<typeof assistantCartLineSchema>
