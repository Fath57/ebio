import type { RecordedToolCall } from './tools/assistant-tool'

/**
 * Les règles de la spec 008, rendues mécaniques.
 *
 * L'ancrage et le ton sont décrits dans l'invite, mais une invite ne se teste
 * pas : elle se relit et on croit ce qu'on lit. Ces fonctions transforment les
 * deux règles qui comptent en quelque chose qui échoue.
 *
 * Ce sont des **heuristiques**, et elles s'assument comme telles : elles
 * repèrent un assistant qui dérape, pas un assistant parfait.
 */

/** En dessous, un nombre est une quantité — « deux kilos », « 5 bouteilles ». */
const AMOUNT_THRESHOLD = 100

/** Au-delà, un tour de parole ne tient plus dans une oreille. */
const MAX_SENTENCES = 3

/**
 * Les nombres d'un texte qui ressemblent à des montants.
 *
 * Le français écrit les milliers avec une espace — parfois insécable, parfois
 * fine — et la voix les dicte de même. Les trois formes sont acceptées, sinon
 * « 5 500 » se lirait comme deux nombres.
 */
export function amountsIn(text: string): number[] {
  const matches = text.matchAll(/\d[\d\xA0\u202F ]*\d|\d+/g)
  return [...matches]
    .map(match => Number(match[0].replace(/[\xA0\u202F ]/g, '')))
    .filter(value => Number.isFinite(value) && value >= AMOUNT_THRESHOLD)
}

/** Tous les nombres qu'un outil a rendus, à n'importe quelle profondeur. */
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
 * Les montants prononcés que nul outil n'a rendus.
 *
 * Vide est la seule réponse acceptable. Un montant inventé sur une place de
 * marché engage un vendeur sur un prix qu'il n'a pas fixé.
 */
export function ungroundedAmounts(reply: string, toolCalls: RecordedToolCall[]): number[] {
  const known = amountsFromTools(toolCalls)
  return amountsIn(reply).filter(amount => !known.has(amount))
}

/** Le nombre de phrases d'un tour, ponctuation forte faisant foi. */
export function sentenceCount(reply: string): number {
  return reply.split(/[.!?…]+/).map(part => part.trim()).filter(Boolean).length
}

export function isTurnTooLong(reply: string): boolean {
  return sentenceCount(reply) > MAX_SENTENCES
}

/**
 * Ce qui trahit la machine.
 *
 * Tiré de la liste de la spec : annoncer le nombre d'options, nommer ses
 * propres actions, parler de « panier » comme d'un objet technique.
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
 * « Livraison comprise », et ses variantes.
 *
 * Un total juste peut habiller une phrase fausse. L'outil prévient déjà le
 * modèle quand l'adresse manque ; ceci vérifie qu'il en a tenu compte.
 */
const DELIVERY_INCLUDED = /\b(?:livraison|frais\s+de\s+livraison)\s+(?:comprise?s?|inclus(?:e|es)?)\b|\btout\s+compris\b/i

/** Les frais de livraison ont-ils été réellement calculés ? */
export function deliveryFeeIsKnown(toolCalls: RecordedToolCall[]): boolean {
  return toolCalls.some(call =>
    call.name === 'estimer_commande'
    && typeof (call.result as { livraison?: unknown } | null)?.livraison === 'number')
}

/**
 * Une réponse qui annonce un ajout au panier.
 *
 * Volontairement étroit : reprendre le modèle à tort abîmerait la conversation.
 * Ce qui est visé, c'est la phrase qui fait croire que la commande contient
 * l'article.
 *
 * Les frontières sont unicode et non `\b` : en JavaScript `\b` est ASCII, et
 * « noté\b » ne correspond jamais puisque « é » n'est pas un caractère de mot.
 */
const CLAIMS_ADDED = /(?:c['’]est|ça y est|voilà)[^.!?]{0,25}(?:dans (?:le|votre) panier|ajouté(?:e|s)?|noté(?:e|s)?)(?!\p{L})|je vous (?:le|la|les|en)?\s?(?:mets|ai mis|rajoute|ajoute)(?!\p{L})|dans (?:le|votre) panier(?!\p{L})/iu

/** Le panier a-t-il réellement changé pendant ce tour ? */
export function cartWasTouched(toolCalls: RecordedToolCall[]): boolean {
  return toolCalls.some(call => call.name === 'ajouter_au_panier' || call.name === 'retirer_du_panier')
}

/** Ce qui, dans une réponse, ne tient pas debout face aux outils appelés. */
export interface GroundingBreach {
  /** Ce qui cloche, pour le journal. */
  what: string
  /** Ce qu'on redemande au modèle, écrit pour lui. */
  fix: string
}

/**
 * L'écart entre ce qui a été dit et ce qui a été vérifié.
 *
 * Les montants connus viennent de toute la conversation et pas du seul tour :
 * redire un prix trouvé deux tours plus tôt est légitime, et le prendre pour
 * une invention ferait sonner l'alarme à chaque échange.
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

  if (CLAIMS_ADDED.test(reply) && !cartWasTouched(toolCalls)) {
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
 * La réponse telle qu'elle sera entendue.
 *
 * Le modèle met des astérisques autour des noms de boutique ; une synthèse
 * vocale les lit ou les avale de travers. Rien de ce qui se voit à l'écrit
 * n'a de sens à l'oreille.
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
