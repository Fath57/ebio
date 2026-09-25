import { apiFetch, apiUrl, getSessionToken } from '../../utils/api-client'

/** One line of the cart the conversation is building, as the server holds it. */
export interface AssistantCartLine {
  productId: string
  name: string
  supplierId: string
  supplierName: string
  quantity: number
  pricePerUnit: number
  unit: string
  /** Thumbnail, absent when the product carries no photo. */
  imageUrl: string | null
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

/** What comes back from the assistant while she is speaking. */
export type AssistantStreamEvent
  = | { type: 'session', sessionId: string }
    | { type: 'phrase', text: string }
    | { type: 'cart', cart: AssistantCartLine[] }
    | { type: 'reset' }
    | { type: 'done', reply: string, cart: AssistantCartLine[] }
    | { type: 'error', message: string }

/**
 * The turn, received as it comes.
 *
 * React Native's `fetch` does not expose a stream: you wait for the whole
 * response, which defeats the point. `XMLHttpRequest`, on the other hand,
 * exposes the text received so far on every progress event — we read what has
 * just arrived from there.
 *
 * Returns a function that cuts: if the buyer leaves the screen, the turn has
 * no business carrying on and costing money.
 */
export function streamTurn(
  message: string,
  sessionId: string | null,
  onEvent: (event: AssistantStreamEvent) => void,
): () => void {
  const request = new XMLHttpRequest()
  let consumed = 0
  let cancelled = false
  // A turn is only finished when the server says so. Without this, a reply
  // that stops short leaves the screen searching for ever.
  let finished = false

  function drain(text: string): void {
    // An event is complete once the blank line that ends it has arrived:
    // without that we would read a JSON document cut in half.
    let boundary = text.indexOf('\n\n', consumed)
    while (boundary !== -1) {
      const raw = text.slice(consumed, boundary).trim()
      consumed = boundary + 2
      if (raw.startsWith('data: ')) {
        try {
          const event = JSON.parse(raw.slice(6)) as AssistantStreamEvent
          if (event.type === 'done' || event.type === 'error') {
            finished = true
          }
          onEvent(event)
        }
        catch {
          // One unreadable event must not take the conversation down.
        }
      }
      boundary = text.indexOf('\n\n', consumed)
    }
  }

  void (async () => {
    const token = await getSessionToken()
    if (cancelled) {
      return
    }

    request.open('POST', `${apiUrl()}/api/assistant/turn/stream`)
    request.setRequestHeader('Content-Type', 'application/json')
    request.setRequestHeader('Accept', 'text/event-stream')
    if (token) {
      request.setRequestHeader('Authorization', `Bearer ${token}`)
    }

    request.onprogress = () => drain(request.responseText)

    /**
     * What to say when the answer never came.
     *
     * A refused request carries no event at all, so draining it finds nothing
     * and the screen would wait for ever. The status is read here because
     * `onerror` only fires when the transport itself fails — an HTTP 401 is a
     * perfectly successful request that happens to say no.
     */
    request.onload = () => {
      drain(request.responseText)
      if (cancelled || finished) {
        return
      }
      onEvent({
        type: 'error',
        message: request.status === 401
          ? 'Votre session a expiré. Reconnectez-vous pour continuer.'
          : 'La réponse s\'est arrêtée en chemin. Réessayez ?',
      })
    }

    request.onerror = () => {
      if (cancelled || finished) {
        return
      }
      onEvent({ type: 'error', message: 'La connexion s\'est interrompue.' })
    }

    request.send(JSON.stringify(sessionId ? { sessionId, message } : { message }))
  })()

  return () => {
    cancelled = true
    request.abort()
  }
}

/**
 * What was said, written down.
 *
 * The recording goes up as is: transcription happens on the server, where the
 * key lives, and the audio is not kept there.
 */
export async function transcribe(uri: string): Promise<string> {
  const form = new FormData()
  form.append('audio', {
    uri,
    name: 'parole.m4a',
    type: 'audio/m4a',
  } as unknown as Blob)

  // Not `apiFetch`: it forces `application/json`, while a multipart upload
  // must let the platform set its own boundary.
  const token = await getSessionToken()
  const res = await fetch(`${apiUrl()}/api/assistant/transcribe`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  if (!res.ok) {
    throw new Error('Je n\'ai pas pu vous entendre. Réessayez ?')
  }

  const data = await res.json() as { text?: string }
  return (data.text ?? '').trim()
}

/**
 * The answer, ready to be heard.
 *
 * Returns a URL rather than a file. The phone hands that URL to the player,
 * which streams it: the sound starts before the whole thing has arrived, and
 * there is no copy to write, encode or delete.
 *
 * One call for the whole answer, not one per sentence. Splitting was meant to
 * start sooner, but the sentences arrive within a tenth of a second of each
 * other — the split bought almost nothing and cost the voice its continuity.
 */
export async function voiceUrl(text: string): Promise<{ uri: string, headers: Record<string, string> } | null> {
  const res = await apiFetch('/api/assistant/voice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texte: text }),
  })
  if (!res.ok) {
    return null
  }

  const { id } = await res.json() as { id?: string }
  if (!id) {
    return null
  }

  const token = await getSessionToken()
  return {
    uri: `${apiUrl()}/api/assistant/voice/${id}`,
    // The player fetches on its own: it carries the session itself, since it
    // is not the one that signed in.
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }
}
