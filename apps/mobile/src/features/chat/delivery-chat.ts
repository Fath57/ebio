import { chatFetch } from '../../utils/api-client'

export type ConversationKind = 'SUPPLIER' | 'COURIER'

export interface DeliveryConversation {
  conversationId: string
  /** Display name of the other side (courier for the buyer, buyer for the courier). */
  peerName: string | null
  orderId: string | null
}

const DEFAULT_ERROR = 'Impossible d’ouvrir la discussion pour le moment.'

/**
 * Get-or-create the courier <-> buyer thread of a delivery. Allowed for the
 * order's buyer and the assigned courier once a courier is assigned.
 * Throws an Error carrying the API's French message on failure.
 */
export async function openDeliveryConversation(deliveryId: string): Promise<DeliveryConversation> {
  const res = await chatFetch(`/api/chat/conversations/delivery/${deliveryId}`, { method: 'POST' })
  const body = await res.json().catch(() => null) as Record<string, unknown> | null
  if (!res.ok) {
    const message = typeof body?.message === 'string' ? body.message : DEFAULT_ERROR
    throw new Error(message)
  }
  if (!body || typeof body.id !== 'string') {
    throw new Error(DEFAULT_ERROR)
  }
  return {
    conversationId: body.id,
    peerName: typeof body.peerName === 'string' ? body.peerName : null,
    orderId: typeof body.orderId === 'string' ? body.orderId : null,
  }
}
