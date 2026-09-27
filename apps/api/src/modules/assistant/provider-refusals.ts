/**
 * Les refus du fournisseur qui ne se retentent pas.
 *
 * Le compte à sec ou la clé refusée arrivent par le même canal qu'une coupure
 * réseau, et l'acheteur lisait « la réponse s'est interrompue » — donc il
 * redemandait, et ça recommençait. Ces codes-là méritent leur propre phrase :
 * il n'y a rien à réessayer, c'est à nous de recharger le compte.
 */
const REFUSAL_CODES = new Set([
  'insufficient_quota',
  'credit_balance_exhausted',
  'rate_limit_exceeded',
  'invalid_api_key',
  'account_deactivated',
])

/** Ce qu'on dit à l'acheteur quand le fournisseur nous ferme la porte. */
export const PROVIDER_REFUSED_MESSAGE = 'Assita est indisponible pour le moment. Revenez un peu plus tard.'

/**
 * Le même refus, mais côté voix seulement.
 *
 * L'oreille et la voix passent par un fournisseur, l'écrit par un autre :
 * quand la voix tombe, Assita répond toujours par écrit. Lui dire de revenir
 * plus tard serait faux — il suffit d'écrire.
 */
export const VOICE_UNAVAILABLE_MESSAGE = 'Ma voix est indisponible pour le moment. Écrivez-moi, je vous réponds.'

/**
 * Reconnaît un refus dans ce que le fournisseur renvoie, quelle que soit la
 * forme : `{ code }`, `{ type }`, ou l'erreur d'un SDK qui les enfouit.
 */
export function isProviderRefusal(error: unknown): boolean {
  if (error === null || typeof error !== 'object') {
    return typeof error === 'string' && [...REFUSAL_CODES].some(code => error.includes(code))
  }
  const shape = error as { code?: unknown, type?: unknown, error?: unknown }
  if (typeof shape.code === 'string' && REFUSAL_CODES.has(shape.code)) {
    return true
  }
  if (typeof shape.type === 'string' && REFUSAL_CODES.has(shape.type)) {
    return true
  }
  // Les SDK emballent souvent la réponse du fournisseur dans `error.error`.
  return shape.error !== undefined && shape.error !== error && isProviderRefusal(shape.error)
}
