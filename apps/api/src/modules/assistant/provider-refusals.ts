/**
 * Provider refusals that retrying cannot fix.
 *
 * An empty account or a revoked key arrive through the same channel as a
 * dropped connection, and the buyer read "the answer was interrupted" — so
 * they asked again, and it started over. These codes deserve their own
 * sentence: there is nothing to retry, it is on us to top the account up.
 */
const REFUSAL_CODES = new Set([
  'insufficient_quota',
  'credit_balance_exhausted',
  'rate_limit_exceeded',
  'invalid_api_key',
  'account_deactivated',
])

/** What the buyer is told when the provider shuts the door on us. */
export const PROVIDER_REFUSED_MESSAGE = 'Assita est indisponible pour le moment. Revenez un peu plus tard.'

/**
 * The same refusal, but on the voice side only.
 *
 * Ear and voice go through one provider, writing through another: when the
 * voice falls over, she still answers in writing. Telling the buyer to come
 * back later would be false — they only have to type.
 */
export const VOICE_UNAVAILABLE_MESSAGE = 'Ma voix est indisponible pour le moment. Écrivez-moi, je vous réponds.'

/**
 * Recognises a refusal in whatever the provider returns, in any shape:
 * `{ code }`, `{ type }`, or an SDK error burying either of them.
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
  // SDKs often wrap the provider's response inside `error.error`.
  return shape.error !== undefined && shape.error !== error && isProviderRefusal(shape.error)
}
