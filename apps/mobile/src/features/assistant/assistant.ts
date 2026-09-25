import * as FileSystem from 'expo-file-system/legacy'
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

  function drain(text: string): void {
    // An event is complete once the blank line that ends it has arrived:
    // without that we would read a JSON document cut in half.
    let boundary = text.indexOf('\n\n', consumed)
    while (boundary !== -1) {
      const raw = text.slice(consumed, boundary).trim()
      consumed = boundary + 2
      if (raw.startsWith('data: ')) {
        try {
          onEvent(JSON.parse(raw.slice(6)) as AssistantStreamEvent)
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
    request.onload = () => {
      drain(request.responseText)
    }
    request.onerror = () => onEvent({
      type: 'error',
      message: 'La connexion s\'est interrompue.',
    })

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
 * The sentence, spoken aloud.
 *
 * Written to a cache file rather than returned as a `data:` URI: Android's
 * audio player cannot read a data URI, and the voice would have fallen silent
 * without saying why. The file is named per turn — the player would not
 * reload a source whose URI had not changed.
 */
export async function speak(text: string): Promise<string | null> {
  const res = await apiFetch('/api/assistant/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texte: text }),
  })
  if (!res.ok) {
    return null
  }

  const blob = await res.blob()
  const base64 = await new Promise<string | null>((resolve) => {
    const reader = new FileReader()
    reader.onerror = () => resolve(null)
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null
      // `readAsDataURL` returns "data:audio/mpeg;base64,…": only what follows
      // the comma is the content.
      resolve(result === null ? null : result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(blob)
  })

  if (base64 === null) {
    return null
  }

  const uri = `${FileSystem.cacheDirectory}assistant-${Date.now()}.mp3`
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 })
  return uri
}

/** A previous turn's file has no business lingering in the cache. */
export function discardSpoken(uri: string | null): void {
  if (uri === null) {
    return
  }
  FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {
    // Already gone: nothing to do.
  })
}
