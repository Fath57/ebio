import type { SupportMessage, SupportThread } from '../utils/support-queries'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchSupportMessages, fetchSupportThreads, replyToSupport, resolveMediaUrl } from '../utils/support-queries'

function formatDate(iso: string | null): string {
  if (iso === null) {
    return ''
  }
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Photo and voice note, resolved when the bubble mounts.
 *
 * Chat media sits in a private bucket, so the message only carries a media
 * id; without this an agent saw an empty bubble where the buyer had sent a
 * picture of the very problem they were reporting.
 */
function MediaBubble({ mediaId, kind }: { mediaId: string, kind: 'PHOTO' | 'VOICE' }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    resolveMediaUrl(mediaId)
      .then((resolved) => {
        if (!cancelled) {
          if (resolved === null) {
            setFailed(true)
          }
          else {
            setUrl(resolved)
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [mediaId])

  if (failed) {
    return <p className="text-sm italic opacity-70">Média indisponible</p>
  }
  if (url === null) {
    return <p className="text-sm italic opacity-70">Chargement du média…</p>
  }
  if (kind === 'PHOTO') {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt="Photo envoyée par l'acheteur" className="max-h-64 rounded-md" />
      </a>
    )
  }

  return <audio controls src={url} className="max-w-full" />
}

/** Both lists refresh on this beat, which is what makes the page feel live. */
const POLL_INTERVAL_MS = 5000

/**
 * The support inbox: every buyer's permanent thread with eBio.
 *
 * Support is a team, so there is no assignment — whoever is on duty opens a
 * thread and answers it. The buyer always sees the same correspondent.
 */
export default function SupportInboxPage() {
  const [threads, setThreads] = useState<SupportThread[]>([])
  const [selected, setSelected] = useState<SupportThread | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Read by the poll timer, which must not restart every time the selection
  // changes — an interval that resets keeps postponing its own tick.
  const selectedId = useRef<string | null>(null)
  selectedId.current = selected?.id ?? null
  const scroller = useRef<HTMLDivElement | null>(null)

  /**
   * `silent` is what a poll passes: no spinner, no error banner, so a blip in
   * the network never blanks a thread someone is reading.
   */
  const loadThreads = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      setThreads(await fetchSupportThreads())
    }
    catch (caught) {
      if (!silent) {
        setError(caught instanceof Error ? caught.message : 'Erreur inconnue')
      }
    }
    finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadThreads()
  }, [loadThreads])

  const loadMessages = useCallback(async (conversationId: string, silent = false) => {
    try {
      // The API answers newest first; a conversation reads the other way.
      setMessages((await fetchSupportMessages(conversationId)).slice().reverse())
    }
    catch (caught) {
      if (!silent) {
        setError(caught instanceof Error ? caught.message : 'Erreur inconnue')
      }
    }
  }, [])

  const openThread = useCallback(async (thread: SupportThread) => {
    setSelected(thread)
    setMessages([])
    await loadMessages(thread.id)
    // Opening marks the thread read server-side; the list must follow.
    await loadThreads(true)
  }, [loadMessages, loadThreads])

  // A thread is read from its end, and a poll that appends below the fold
  // would otherwise go unnoticed.
  useEffect(() => {
    const node = scroller.current
    if (node !== null) {
      node.scrollTop = node.scrollHeight
    }
  }, [messages])

  /**
   * The buyer writes from a phone, so nothing in the browser knows a message
   * arrived. Polling while the tab is visible is what turns the inbox from a
   * page you refresh into one you watch.
   */
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') {
        return
      }
      void loadThreads(true)
      if (selectedId.current !== null) {
        void loadMessages(selectedId.current, true)
      }
    }
    const timer = setInterval(tick, POLL_INTERVAL_MS)
    document.addEventListener('visibilitychange', tick)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [loadThreads, loadMessages])

  const send = useCallback(async () => {
    if (selected === null || draft.trim() === '') {
      return
    }
    setSending(true)
    try {
      await replyToSupport(selected.id, draft.trim())
      setDraft('')
      await loadMessages(selected.id)
      await loadThreads(true)
    }
    catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Erreur inconnue')
    }
    finally {
      setSending(false)
    }
  }, [selected, draft, loadMessages, loadThreads])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Support</h2>
        <p className="text-muted-foreground">
          Les conversations des acheteurs avec eBio. Chacun n'en a qu'une, et
          n'importe quel membre de l'équipe peut y répondre.
        </p>
      </div>

      {error !== null && <p className="text-destructive text-sm">{error}</p>}

      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conversations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {loading
              ? <p className="text-muted-foreground text-sm">Chargement…</p>
              : threads.length === 0
                ? <p className="text-muted-foreground text-sm">Aucune conversation.</p>
                : threads.map(thread => (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() => openThread(thread)}
                      className={`hover:bg-muted w-full rounded-md p-3 text-left ${selected?.id === thread.id ? 'bg-muted' : ''}`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium">{thread.buyerName}</span>
                        {thread.unreadCount > 0 && (
                          <span className="bg-primary text-primary-foreground rounded-full px-2 text-xs">
                            {thread.unreadCount}
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground block truncate text-sm">
                        {thread.lastMessage ?? 'Pas encore de message'}
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        {formatDate(thread.lastMessageAt)}
                      </span>
                    </button>
                  ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {selected !== null ? selected.buyerName : 'Choisissez une conversation'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selected === null
              ? <p className="text-muted-foreground text-sm">Rien à afficher pour l'instant.</p>
              : (
                  <>
                    <div ref={scroller} className="max-h-96 space-y-3 overflow-y-auto">
                      {messages.length === 0
                        ? <p className="text-muted-foreground text-sm">Aucun message.</p>
                        : messages.map((message) => {
                            const fromBuyer = message.senderId === selected.buyerId
                            return (
                              <div
                                key={message.id}
                                className={fromBuyer ? 'flex justify-start' : 'flex justify-end'}
                              >
                                <div
                                  className={`max-w-[75%] rounded-lg px-3 py-2 ${fromBuyer ? 'bg-muted' : 'bg-primary text-primary-foreground'}`}
                                >
                                  {(message.type === 'PHOTO' || message.type === 'VOICE') && message.mediaUrl !== null
                                    ? <MediaBubble mediaId={message.mediaUrl} kind={message.type} />
                                    : message.type === 'LOCATION'
                                      ? <p className="text-sm">📍 Position partagée</p>
                                      : <p className="text-sm whitespace-pre-line">{message.content}</p>}
                                  <p className={`mt-1 text-xs ${fromBuyer ? 'text-muted-foreground' : 'text-primary-foreground/70'}`}>
                                    {!fromBuyer && `${message.senderName} · `}
                                    {formatDate(message.createdAt)}
                                  </p>
                                </div>
                              </div>
                            )
                          })}
                    </div>

                    <Textarea
                      value={draft}
                      onChange={event => setDraft(event.target.value)}
                      placeholder="Votre réponse…"
                      rows={3}
                    />
                    <Button onClick={send} disabled={sending || draft.trim() === ''}>
                      Envoyer
                    </Button>
                  </>
                )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
