import type { RecordedToolCall } from './tools/assistant-tool'

/**
 * The rules of spec 008, made mechanical.
 *
 * Grounding and tone are described in the prompt, but a prompt cannot be
 * tested: it is re-read, and one believes what one reads. These functions turn
 * the two rules that matter into something that can fail.
 *
 * They are **heuristics** and make no secret of it: they catch an assistant
 * going off the rails, not a perfect one.
 */

/** Below this, a number is a quantity — "deux kilos", "5 bouteilles". */
const AMOUNT_THRESHOLD = 100

/** Beyond this, a turn no longer fits in one listening. */
const MAX_SENTENCES = 3

/**
 * The numbers in a text that look like amounts.
 *
 * French writes thousands with a space — sometimes non-breaking, sometimes
 * thin — and dictation produces the same. All three forms are accepted, or
 * "5 500" would read as two numbers.
 */
export function amountsIn(text: string): number[] {
  const matches = text.matchAll(/\d[\d\xA0\u202F ]*\d|\d+/g)
  return [...matches]
    .map(match => Number(match[0].replace(/[\xA0\u202F ]/g, '')))
    .filter(value => Number.isFinite(value) && value >= AMOUNT_THRESHOLD)
}

/** Every number a tool returned, at any depth. */
export function amountsFromTools(toolCalls: RecordedToolCall[]): Set<number> {
  const found = new Set<number>()

  const walk = (value: unknown): void => {
    if (typeof value === 'number') {
      found.add(value)
      return
    }
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    if (value !== null && typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach(walk)
    }
  }

  toolCalls.forEach(call => walk(call.result))
  return found
}

/**
 * The spoken amounts that no tool returned.
 *
 * Empty is the only acceptable answer. An invented amount on a marketplace
 * commits a shop to a price it never set.
 */
export function ungroundedAmounts(reply: string, toolCalls: RecordedToolCall[]): number[] {
  const known = amountsFromTools(toolCalls)
  return amountsIn(reply).filter(amount => !known.has(amount))
}

/** How many sentences a turn holds, going by terminal punctuation. */
export function sentenceCount(reply: string): number {
  return reply.split(/[.!?…]+/).map(part => part.trim()).filter(Boolean).length
}

export function isTurnTooLong(reply: string): boolean {
  return sentenceCount(reply) > MAX_SENTENCES
}

/**
 * What gives the machine away.
 *
 * Taken from the spec's list: announcing how many options there are, naming
 * one's own actions, talking about "le panier" as a technical object.
 */
const MACHINE_TELLS: Array<{ pattern: RegExp, why: string }> = [
  { pattern: /\bj[e'’]\s*(vais|vas)\s+(maintenant\s+)?(ajouter|rechercher|chercher|procéder)/i, why: 'nomme sa propre action' },
  { pattern: /\b(recherche|traitement)\s+en\s+cours\b/i, why: 'annonce un état technique' },
  { pattern: /\bj[e'’]ai\s+(trouvé\s+)?(deux|trois|quatre|cinq|\d+)\s+(options|propositions|résultats)\b/i, why: 'annonce le nombre d\'options' },
  { pattern: /\bsouhaitez-vous que je\b/i, why: 'vouvoiement administratif' },
  { pattern: /\bvotre\s+panier\s+(a\s+été|est\s+maintenant)\b/i, why: 'parle du panier comme d\'un objet technique' },
]

export function machineTells(reply: string): string[] {
  return MACHINE_TELLS.filter(tell => tell.pattern.test(reply)).map(tell => tell.why)
}

/**
 * "Livraison comprise", and its variants.
 *
 * A correct total can dress up a false sentence. The tool already warns the
 * model when the address is missing; this checks that it listened.
 */
const DELIVERY_INCLUDED = /\b(?:livraison|frais\s+de\s+livraison)\s+(?:comprise?s?|inclus(?:e|es)?)\b|\btout\s+compris\b/i

/** Were the delivery fees actually computed? */
export function deliveryFeeIsKnown(toolCalls: RecordedToolCall[]): boolean {
  return toolCalls.some(call =>
    call.name === 'estimer_commande'
    && typeof (call.result as { livraison?: unknown } | null)?.livraison === 'number')
}

/**
 * An answer that announces something was added to the cart.
 *
 * Deliberately narrow: correcting the model wrongly would damage the
 * conversation. What is targeted is the sentence that makes a buyer believe
 * the order contains the item.
 *
 * The boundaries are unicode rather than `\b`: in JavaScript `\b` is ASCII, and
 * "noté\b" never matches because "é" is not a word character.
 */
const CLAIMS_ADDED = /(?:c['’]est|ça y est|voilà)[^.!?]{0,25}(?:dans (?:le|votre) panier|ajouté(?:e|s)?|noté(?:e|s)?)(?!\p{L})|je vous (?:le|la|les|en)?\s?(?:mets|ai mis|rajoute|ajoute)(?!\p{L})|dans (?:le|votre) panier(?!\p{L})/iu

/**
 * An announcement, not an offer.
 *
 * "Je vous mets deux kilos ?" is a question — it is even the phrasing the
 * prompt teaches. Reading it as an announcement had the model corrected on a
 * plain hello, all the way down to the fallback sentence. Only a sentence that
 * does not ask commits to anything.
 */
function announcesAddition(reply: string): boolean {
  return reply
    .split(/(?<=[.!?…])\s+/)
    .filter(sentence => !sentence.trim().endsWith('?'))
    .some(sentence => CLAIMS_ADDED.test(sentence))
}

/** Did the cart actually change during this turn? */
export function cartWasTouched(toolCalls: RecordedToolCall[]): boolean {
  return toolCalls.some(call => call.name === 'ajouter_au_panier' || call.name === 'retirer_du_panier')
}

/** What, in an answer, does not stand up against the tools that ran. */
export interface GroundingBreach {
  /** What is wrong, for the log. */
  what: string
  /** What we ask the model to do about it, written for it. */
  fix: string
}

/**
 * The gap between what was said and what was verified.
 *
 * The known amounts come from the whole conversation, not the current turn
 * alone: repeating a price found two turns ago is legitimate, and reading it
 * as an invention would raise the alarm on every exchange.
 */
export function groundingBreaches(
  reply: string,
  toolCalls: RecordedToolCall[],
  knownAmounts: Iterable<number> = [],
): GroundingBreach[] {
  const breaches: GroundingBreach[] = []

  const known = new Set([...knownAmounts, ...amountsFromTools(toolCalls)])
  const invented = amountsIn(reply).filter(amount => !known.has(amount))
  if (invented.length > 0) {
    breaches.push({
      what: `montant sans source : ${invented.join(', ')}`,
      fix: `Tu viens d'annoncer ${invented.join(', ')} sans qu'aucun outil ne l'ait rendu. `
        + 'Appelle l\'outil qui donne ce chiffre, puis redis ta phrase. Si tu ne peux pas l\'obtenir, ne donne aucun montant.',
    })
  }

  if (announcesAddition(reply) && !cartWasTouched(toolCalls)) {
    breaches.push({
      what: 'ajout annoncé sans que le panier ait bougé',
      fix: 'Tu viens de laisser entendre que l\'article est dans le panier alors que tu ne l\'y as pas mis. '
        + 'Appelle ajouter_au_panier, puis redis ta phrase. Si la quantité ou le produit ne sont pas clairs, demande — n\'annonce rien.',
    })
  }

  if (DELIVERY_INCLUDED.test(reply) && !deliveryFeeIsKnown(toolCalls)) {
    breaches.push({
      what: 'livraison annoncée comprise sans frais calculés',
      fix: 'Tu viens de dire que la livraison était comprise alors que les frais n\'ont pas été calculés. '
        + 'Redis ta phrase en précisant que le total ne couvre que les articles.',
    })
  }

  return breaches
}

/**
 * The answer as it will be heard.
 *
 * The model puts asterisks around shop names; speech synthesis either reads
 * them out or swallows them badly. Nothing that only makes sense in writing
 * makes sense to an ear.
 */
export function forSpeech(reply: string): string {
  return reply
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(?<![\p{L}\d])[*_](\S(?:.*?\S)?)[*_](?![\p{L}\d])/gu, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Splits a stream of text into finished sentences.
 *
 * Returns the completed ones and keeps the rest: a sentence is only streamed
 * once whole, because half an amount cannot be checked. "2 500" must not go
 * out the moment the model has written "2".
 */
export function takeSentences(buffer: string): { sentences: string[], rest: string } {
  const sentences: string[] = []
  let rest = buffer

  // Terminal punctuation closes a sentence when a space or a capital follows.
  // Without that, the dot could belong to a number; and the model sometimes
  // forgets the space — "je regarde.J'ai du gari" really is two sentences, and
  // they must be separated before being shown.
  const boundary = /[.!?…]+(?:\s|(?=\p{Lu}))/u

  let match = boundary.exec(rest)
  while (match !== null) {
    const cut = match.index + match[0].length
    const sentence = rest.slice(0, cut).trim()
    if (sentence.length > 0) {
      sentences.push(sentence)
    }
    rest = rest.slice(cut)
    match = boundary.exec(rest)
  }

  return { sentences, rest }
}
