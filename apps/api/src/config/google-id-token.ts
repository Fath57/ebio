import type { JWTVerifyGetKey } from 'jose'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

/**
 * Checks a Google ID token against every client the apps sign in with.
 *
 * Better Auth only accepts its single `clientId` as audience — the web client.
 * Android tokens carry it, but Google issues an iPhone's token for the app's
 * own iOS client, so every iOS sign-in was refused. Same checks otherwise:
 * Google's keys, issuer, freshness and the nonce when one was sent.
 */
export function createGoogleIdTokenVerifier(audiences: string[], keys: JWTVerifyGetKey = GOOGLE_JWKS) {
  return async (token: string, nonce?: string): Promise<boolean> => {
    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer: GOOGLE_ISSUERS,
        audience: audiences,
        maxTokenAge: '1h',
      })
      return !nonce || payload.nonce === nonce
    }
    catch {
      return false
    }
  }
}
