import { chatFetch } from '../../utils/api-client'

export interface SupportConversation {
  id: string
  kind: 'SUPPORT'
}

/**
 * The buyer's permanent thread with eBio, created server-side on first call
 * and returned unchanged afterwards. One thread per buyer, so the history
 * stays in one place.
 */
export async function openSupportConversation(): Promise<SupportConversation> {
  const res = await chatFetch('/api/chat/conversations/support', { method: 'POST' })
  if (!res.ok) {
    throw new Error('La messagerie du support est indisponible')
  }
  return await res.json() as SupportConversation
}
