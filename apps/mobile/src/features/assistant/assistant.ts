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

/** Ce qui arrive de l'assistant pendant qu'il parle. */
export type AssistantStreamEvent
  = | { type: 'session', sessionId: string }
    | { type: 'phrase', text: string }
    | { type: 'cart', cart: AssistantCartLine[] }
    | { type: 'reset' }
    | { type: 'done', reply: string, cart: AssistantCartLine[] }
    | { type: 'error', message: string }

/**
 * Le tour, reçu au fil de l'eau.
 *
 * `fetch` de React Native ne rend pas de flux : il faut attendre la réponse
 * entière, ce qui annule tout l'intérêt. `XMLHttpRequest` expose, lui, le texte
 * déjà reçu à chaque progression — on y relit ce qui vient d'arriver.
 *
 * Rend une fonction qui coupe : si l'acheteur quitte l'écran, le tour n'a pas
 * à continuer de coûter.
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
    // Un événement est complet quand la ligne vide qui le termine est arrivée :
    // sans cela on lirait un JSON coupé en deux.
    let boundary = text.indexOf('\n\n', consumed)
    while (boundary !== -1) {
      const raw = text.slice(consumed, boundary).trim()
      consumed = boundary + 2
      if (raw.startsWith('data: ')) {
        try {
          onEvent(JSON.parse(raw.slice(6)) as AssistantStreamEvent)
        }
        catch {
          // Un événement illisible ne doit pas emporter la conversation.
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
 * Ce qui a été dit, mis par écrit.
 *
 * L'enregistrement part tel quel : la transcription se fait sur le serveur,
 * où la clé vit, et l'audio n'y est pas conservé.
 */
export async function transcribe(uri: string): Promise<string> {
  const form = new FormData()
  form.append('audio', {
    uri,
    name: 'parole.m4a',
    type: 'audio/m4a',
  } as unknown as Blob)

  // Pas `apiFetch` : il impose `application/json`, alors qu'un envoi multipart
  // doit laisser la plateforme poser sa propre frontière.
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
 * La phrase, dite à voix haute.
 *
 * Écrite dans un fichier du cache plutôt que rendue en `data:` : le lecteur
 * audio d'Android ne sait pas lire une URI de données, et la voix se serait
 * tue sans rien dire. Le fichier porte un nom par tour — le lecteur ne
 * rechargerait pas une source dont l'URI n'a pas changé.
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
      // `readAsDataURL` rend « data:audio/mpeg;base64,… » : seul l'après-virgule
      // est le contenu.
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

/** Le fichier d'un tour précédent n'a plus à traîner dans le cache. */
export function discardSpoken(uri: string | null): void {
  if (uri === null) {
    return
  }
  FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {
    // Déjà parti : rien à faire.
  })
}
