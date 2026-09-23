import { createHmac } from 'node:crypto'
import { buildSigningString, signRequest, sortedQueryString, verifyWebhookSignature } from './intram-client'

const SECRET = 'sk_sandbox_test'

describe('signature des requêtes INTRAM', () => {
  it('signe le chemin interne réécrit, pas l\'URL publique appelée', () => {
    const signing = buildSigningString('2026-05-20T10:30:00.000Z', 'POST', '/payment-requests', '', '{}')
    // The whole integration turns on this line: their proxy rewrites
    // /v1/<endpoint> to /api/v1/merchant/<endpoint>, and it is the rewritten
    // path that is signed.
    expect(signing.split('\n')[2]).toBe('/api/v1/merchant/payment-requests')
  })

  it('assemble les cinq champs dans l\'ordre imposé', () => {
    const signing = buildSigningString('2026-05-20T10:30:00.000Z', 'get', '/balance', 'a=1', '')
    expect(signing.split('\n')).toEqual([
      '2026-05-20T10:30:00.000Z',
      'GET',
      '/api/v1/merchant/balance',
      'a=1',
      '',
    ])
  })

  it('produit un HMAC-SHA256 hexadécimal préfixé', () => {
    const signing = buildSigningString('2026-05-20T10:30:00.000Z', 'POST', '/payouts', '', '{"amount":1000}')
    const expected = `sha256=${createHmac('sha256', SECRET).update(signing).digest('hex')}`
    expect(signRequest(signing, SECRET)).toBe(expected)
  })

  it('trie la query par clé et ignore les valeurs absentes', () => {
    expect(sortedQueryString({ page: 2, limit: undefined, cursor: 'abc' })).toBe('cursor=abc&page=2')
  })
})

describe('vérification des webhooks INTRAM', () => {
  const timestamp = '2026-05-20T10:31:14.000Z'
  const rawBody = '{"event":"payment_request.paid","operation_id":"op_2f4a"}'
  const valid = `sha256=${createHmac('sha256', SECRET).update(`${timestamp}.${rawBody}`).digest('hex')}`
  const now = new Date(timestamp)

  it('accepte une signature calculée sur « timestamp.corps brut »', () => {
    expect(verifyWebhookSignature({ rawBody, signature: valid, timestamp, secret: SECRET, now })).toBe(true)
  })

  it('refuse un corps modifié après signature', () => {
    const tampered = rawBody.replace('paid', 'failed')
    expect(verifyWebhookSignature({ rawBody: tampered, signature: valid, timestamp, secret: SECRET, now })).toBe(false)
  })

  // The body must be verified as received: re-serialising the parsed JSON
  // changes spacing and key order, and the HMAC no longer matches.
  it('refuse un corps re-sérialisé depuis le JSON analysé', () => {
    const reserialised = JSON.stringify(JSON.parse(rawBody), null, 2)
    expect(verifyWebhookSignature({ rawBody: reserialised, signature: valid, timestamp, secret: SECRET, now })).toBe(false)
  })

  it('refuse une livraison rejouée au-delà de la fenêtre de cinq minutes', () => {
    const late = new Date(Date.parse(timestamp) + 6 * 60 * 1000)
    expect(verifyWebhookSignature({ rawBody, signature: valid, timestamp, secret: SECRET, now: late })).toBe(false)
  })

  it('refuse un horodatage en avance sur notre horloge', () => {
    const early = new Date(Date.parse(timestamp) - 6 * 60 * 1000)
    expect(verifyWebhookSignature({ rawBody, signature: valid, timestamp, secret: SECRET, now: early })).toBe(false)
  })

  it('refuse une signature ou un horodatage manquants', () => {
    expect(verifyWebhookSignature({ rawBody, signature: undefined, timestamp, secret: SECRET, now })).toBe(false)
    expect(verifyWebhookSignature({ rawBody, signature: valid, timestamp: undefined, secret: SECRET, now })).toBe(false)
  })

  it('refuse une signature signée avec un autre secret', () => {
    const other = `sha256=${createHmac('sha256', 'sk_autre').update(`${timestamp}.${rawBody}`).digest('hex')}`
    expect(verifyWebhookSignature({ rawBody, signature: other, timestamp, secret: SECRET, now })).toBe(false)
  })
})
