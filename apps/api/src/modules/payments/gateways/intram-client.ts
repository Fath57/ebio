import { Buffer } from 'node:buffer'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { Logger } from '@nestjs/common'
import { config } from '../../../config/env.config'

/**
 * The path that goes into the signature — and, as it turns out, the real
 * route too.
 *
 * Their documentation gives `https://api.intram.org/v1` as the base URL and
 * calls `/api/v1/merchant/<endpoint>` an internal rewrite. Against the live
 * API the first 404s and only the second answers, so the "internal" path is
 * simply the public one. Signing anything else returns `signature_invalid`
 * with nothing to say what is wrong, which is why this sits in one place.
 */
const SIGNED_PATH_PREFIX = '/api/v1/merchant'

/** INTRAM rejects anything older than five minutes. */
export const SIGNATURE_WINDOW_MS = 5 * 60 * 1000

export interface IntramEnvelope<T> {
  error: boolean
  http_status: number
  data: T
  code?: string
  message?: string
}

/**
 * Builds the string INTRAM expects to be signed: five fields, newline-joined,
 * in this order and no other.
 */
export function buildSigningString(
  timestamp: string,
  method: string,
  endpoint: string,
  sortedQuery: string,
  rawBody: string,
): string {
  return [timestamp, method.toUpperCase(), `${SIGNED_PATH_PREFIX}${endpoint}`, sortedQuery, rawBody].join('\n')
}

/** `sha256=<hex>`, the shape INTRAM reads in `X-Signature`. */
export function signRequest(signingString: string, secretKey: string): string {
  return `sha256=${createHmac('sha256', secretKey).update(signingString).digest('hex')}`
}

/**
 * Query strings go into the signature sorted by key, so a caller cannot
 * change the meaning of a request by reordering it.
 */
export function sortedQueryString(query: Record<string, string | number | undefined>): string {
  const pairs = Object.entries(query)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([a], [b]) => a.localeCompare(b))

  return pairs.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')
}

/**
 * Verifies an incoming webhook: HMAC of `${timestamp}.${raw body}` with the
 * webhook secret — a different secret from the one signing our own calls.
 *
 * The body must be the bytes as received. Re-serialising the parsed JSON
 * changes key order and spacing, and the signature no longer matches.
 */
export function verifyWebhookSignature(params: {
  rawBody: string
  signature: string | undefined
  timestamp: string | undefined
  secret: string
  now?: Date
}): boolean {
  const { rawBody, signature, timestamp, secret } = params
  if (!signature || !timestamp) {
    return false
  }

  const sentAt = Date.parse(timestamp)
  if (Number.isNaN(sentAt)) {
    return false
  }
  // Replay window, both ways: a clock ahead of ours is as suspect as an old
  // delivery being replayed.
  const now = (params.now ?? new Date()).getTime()
  if (Math.abs(now - sentAt) > SIGNATURE_WINDOW_MS) {
    return false
  }

  const expected = `sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`
  const given = Buffer.from(signature)
  const wanted = Buffer.from(expected)

  return given.length === wanted.length && timingSafeEqual(given, wanted)
}

/**
 * Signed HTTP client for the INTRAM Merchant API.
 *
 * Every call carries its own HMAC, so there is no session and nothing to keep
 * warm; what it does need is a clock within five minutes of theirs and, in
 * live mode, a server IP declared in their allowlist — an undeclared IP is
 * refused with `ip_not_allowed` before the body is even read.
 */
export class IntramClient {
  private readonly logger = new Logger(IntramClient.name)

  constructor(
    private readonly apiKey = config.payments.intram.apiKey ?? '',
    private readonly secretKey = config.payments.intram.secretKey ?? '',
    private readonly baseUrl = config.payments.intram.apiUrl,
  ) {}

  /** True once both keys are configured — the factory refuses to build without. */
  isConfigured(): boolean {
    return this.apiKey !== '' && this.secretKey !== ''
  }

  async get<T>(endpoint: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
    return this.request<T>('GET', endpoint, undefined, query)
  }

  /**
   * `idempotencyKey` is what makes a retry safe: INTRAM returns the first
   * result instead of charging or paying out twice. Callers pass a key
   * derived from the business object, never a fresh random one per attempt.
   */
  async post<T>(endpoint: string, body: unknown, idempotencyKey?: string): Promise<T> {
    return this.request<T>('POST', endpoint, body, {}, idempotencyKey)
  }

  private async request<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    body?: unknown,
    query: Record<string, string | number | undefined> = {},
    idempotencyKey?: string,
  ): Promise<T> {
    const timestamp = new Date().toISOString()
    const rawBody = body === undefined ? '' : JSON.stringify(body)
    const sortedQuery = sortedQueryString(query)
    const signature = signRequest(
      buildSigningString(timestamp, method, endpoint, sortedQuery, rawBody),
      this.secretKey,
    )

    const url = `${this.baseUrl}${endpoint}${sortedQuery === '' ? '' : `?${sortedQuery}`}`
    const headers: Record<string, string> = {
      'X-Api-Key': this.apiKey,
      'X-Timestamp': timestamp,
      'X-Signature': signature,
    }
    if (method === 'POST') {
      headers['Content-Type'] = 'application/json'
      headers['Idempotency-Key'] = idempotencyKey ?? randomUUID()
    }

    const response = await fetch(url, { method, headers, body: rawBody === '' ? undefined : rawBody })
    const text = await response.text()

    let envelope: IntramEnvelope<T> | null = null
    try {
      envelope = JSON.parse(text) as IntramEnvelope<T>
    }
    catch {
      // A gateway error page rather than the API: keep the body in the log,
      // it is the only thing that says which hop failed.
      this.logger.error(`INTRAM ${method} ${endpoint} → ${response.status}, réponse illisible: ${text.slice(0, 500)}`)
      throw new Error(`INTRAM ${endpoint}: réponse illisible (${response.status})`)
    }

    if (!response.ok || envelope.error) {
      const code = envelope.code ?? String(response.status)
      this.logger.error(`INTRAM ${method} ${endpoint} → ${code}: ${envelope.message ?? text.slice(0, 300)}`)
      throw new Error(`INTRAM ${endpoint}: ${code}`)
    }

    return envelope.data
  }
}
