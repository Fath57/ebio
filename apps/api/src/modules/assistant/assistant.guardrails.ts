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
