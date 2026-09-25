import { z } from 'zod'

export const assistantTurnSchema = z.object({
  /** Absent on the first turn: the server then opens the conversation. */
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
   * The cart the conversation built. The app picks it up: eBio has no
   * server-side cart yet, and this one will replace it the day there is one.
   */
  cart: z.array(cartLineSchema),
}).meta({
  title: 'AssistantTurnResponse',
  description: 'La réponse de l\'assistant et l\'état du panier',
})

/**
 * A correction by hand, while the conversation carries on.
 *
 * `quantite` at zero removes the line. The buyer corrects without having to
 * say it out loud: tapping is faster than explaining.
 */
export const assistantCartLineSchema = z.object({
  produitId: z.string().uuid(),
  quantite: z.number().int().min(0).max(999),
}).meta({
  title: 'AssistantCartAdjustment',
  description: 'Corriger une ligne du panier de la conversation',
})

/** The text to speak. Bounded: beyond it, this is no longer one turn. */
export const assistantSpeakSchema = z.object({
  texte: z.string().trim().min(1).max(2000),
}).meta({
  title: 'AssistantSpeak',
  description: 'Faire dire une réponse à voix haute',
})

export type AssistantSpeakInput = z.infer<typeof assistantSpeakSchema>
export type AssistantTurnInput = z.infer<typeof assistantTurnSchema>
export type AssistantCartLineInput = z.infer<typeof assistantCartLineSchema>
