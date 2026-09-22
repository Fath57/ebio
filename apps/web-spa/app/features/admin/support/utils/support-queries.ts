import {
  mediaControllerGetDownloadUrl,
  supportControllerListMessages,
  supportControllerListThreads,
  supportControllerReply,
  supportControllerUnread,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export interface SupportThread {
  id: string
  buyerId: string
  buyerName: string
  lastMessage: string | null
  lastMessageAt: string | null
  unreadCount: number
}

export type SupportMessageType = 'TEXT' | 'PHOTO' | 'VOICE' | 'LOCATION'

export interface SupportMessage {
  id: string
  type: SupportMessageType
  content: string
  /** Media id, not a URL — private bucket, resolved when displayed. */
  mediaUrl: string | null
  durationMs: number | null
  senderId: string
  senderName: string
  createdAt: string
}

/**
 * The support inbox, served by admin routes on the session guard.
 *
 * The apps read the same threads through `/api/chat`, which is guarded by a
 * JWT the back-office does not hold — hence a separate surface over the same
 * service rather than a looser guard for everyone.
 */
export async function fetchSupportThreads(): Promise<SupportThread[]> {
  const response = await supportControllerListThreads()
  if (response.error) {
    throw new Error('Impossible de charger les conversations')
  }
  return (response.data ?? []) as SupportThread[]
}

export async function fetchSupportMessages(conversationId: string): Promise<SupportMessage[]> {
  const response = await supportControllerListMessages({ path: { id: conversationId } })
  if (response.error) {
    throw new Error('Impossible de charger les messages')
  }
  return (response.data ?? []) as SupportMessage[]
}

export interface SupportUnread {
  /** Threads holding at least one unanswered message. */
  threads: number
  messages: number
}

/**
 * The header badge. Polled, so it stays deliberately cheap: one count, no
 * thread list, and a failure returns zero rather than throwing — a support
 * counter is not worth an error banner on every page of the back-office.
 */
export async function fetchSupportUnread(): Promise<SupportUnread> {
  const response = await supportControllerUnread()
  if (response.error) {
    return { threads: 0, messages: 0 }
  }
  return (response.data ?? { threads: 0, messages: 0 }) as SupportUnread
}

const signedUrls = new Map<string, string>()

/**
 * Turns a media id into a URL the browser can load. Chat media lives in a
 * private bucket, so every photo and voice note goes through a signed link;
 * the result is cached for the session, since the same thread is reopened
 * many times while an agent works through it.
 */
export async function resolveMediaUrl(mediaId: string): Promise<string | null> {
  const cached = signedUrls.get(mediaId)
  if (cached !== undefined) {
    return cached
  }
  const response = await mediaControllerGetDownloadUrl({
    path: { id: mediaId },
    query: { expiresIn: '86400' },
  })
  const url = (response.data as { downloadUrl?: string } | undefined)?.downloadUrl
  if (url === undefined) {
    return null
  }
  signedUrls.set(mediaId, url)
  return url
}

/** Answers a support thread. Text only — the back-office is not a phone. */
export async function replyToSupport(conversationId: string, content: string): Promise<void> {
  const response = await supportControllerReply({
    path: { id: conversationId },
    body: { content },
  })
  if (response.error) {
    throw new Error('Le message n\'a pas pu être envoyé')
  }
}
