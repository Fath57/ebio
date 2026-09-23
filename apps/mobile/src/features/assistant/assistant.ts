import { apiFetch } from '../../utils/api-client'

/** One line of the cart the conversation is building, as the server holds it. */
export interface AssistantCartLine {
  productId: string
  name: string
  supplierId: string
  supplierName: string
  quantity: number
  pricePerUnit: number
  unit: string
}

export interface AssistantTurn {
  sessionId: string
  reply: string
  cart: AssistantCartLine[]
}

/**
 * The buyer speaks, the assistant answers.
 *
 * `sessionId` is absent on the first turn — the server opens the conversation
 * and hands back its id, which every later turn carries.
 *
 * The cart comes back whole rather than as a change: the screen shows what the
 * server holds, so a line added by the assistant and a line the buyer removed
 * by hand can never drift apart.
 */
export async function sendTurn(message: string, sessionId: string | null): Promise<AssistantTurn> {
  const res = await apiFetch('/api/assistant/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sessionId ? { sessionId, message } : { message }),
  })

  if (!res.ok) {
    throw new Error(res.status === 401
      ? 'Connectez-vous pour parler à l\'assistant.'
      : 'L\'assistant ne répond pas. Réessayez dans un instant.')
  }

  return await res.json() as AssistantTurn
}

/** What the conversation costs, as the screen keeps it. */
export function cartTotal(cart: AssistantCartLine[]): number {
  return cart.reduce((sum, line) => sum + line.pricePerUnit * line.quantity, 0)
}
