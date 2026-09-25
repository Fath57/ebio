import { createHmac } from 'node:crypto'
import { config } from '../../config/env.config'

/**
 * A session token in the form the clients can actually use.
 *
 * Better Auth does not read a bare token: it signs its session cookie and
 * checks that signature on the way back, so `getSession` returns null for an
 * unsigned value. Anything that mints a session by hand has to sign it the
 * same way, or it hands out a token that is refused on the very next call.
 *
 * The format is the one Better Auth writes in `set-cookie`:
 * `<token>.<base64 HMAC-SHA256 of the token, keyed by the auth secret>`.
 * It is verified against a real cookie rather than read off documentation.
 *
 * This ties us to an internal format. The day Better Auth changes it, every
 * hand-made session stops resolving at once — which is at least loud.
 */
export function signSessionToken(token: string): string {
  const signature = createHmac('sha256', config.betterAuth.secret).update(token).digest('base64')
  return `${token}.${signature}`
}
