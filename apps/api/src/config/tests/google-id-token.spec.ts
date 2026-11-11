import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'
import { createGoogleIdTokenVerifier } from '../google-id-token'

const WEB = 'web-client.apps.googleusercontent.com'
const IOS = 'ios-client.apps.googleusercontent.com'

describe('createGoogleIdTokenVerifier', () => {
  let sign: (claims: Record<string, unknown>) => Promise<string>
  let verify: ReturnType<typeof createGoogleIdTokenVerifier>

  beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256')
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }
    verify = createGoogleIdTokenVerifier([WEB, IOS], createLocalJWKSet({ keys: [jwk] }))
    sign = async ({ iss = 'https://accounts.google.com', aud, ...rest }) =>
      new SignJWT(rest)
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuer(iss as string)
        .setAudience(aud as string)
        .setIssuedAt()
        .setExpirationTime('10m')
        .sign(privateKey)
  })

  it('accepts the web client (Android) and the iOS client (iPhone)', async () => {
    expect(await verify(await sign({ aud: WEB }))).toBe(true)
    expect(await verify(await sign({ aud: IOS }))).toBe(true)
  })

  it('refuses a token issued for another app', async () => {
    expect(await verify(await sign({ aud: 'someone-else.apps.googleusercontent.com' }))).toBe(false)
  })

  it('refuses another issuer', async () => {
    expect(await verify(await sign({ aud: IOS, iss: 'https://evil.example' }))).toBe(false)
  })

  it('checks the nonce when one is sent', async () => {
    const token = await sign({ aud: IOS, nonce: 'abc' })
    expect(await verify(token, 'abc')).toBe(true)
    expect(await verify(token, 'other')).toBe(false)
  })
})
