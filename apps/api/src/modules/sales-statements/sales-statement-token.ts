import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { config } from '../../config/env.config'

/** Long enough for the browser to open, short enough that a leaked link soon dies. */
export const STATEMENT_LINK_TTL_MS = 10 * 60 * 1000

interface StatementTokenPayload {
  supplierId: string
  from: string
  to: string
  expiresAt: number
}

function sign(body: string): string {
  return createHmac('sha256', `sales-statement:${config.betterAuth.secret}`).update(body).digest('base64url')
}

/**
 * A download link carries no session: the phone hands it to its browser, which
 * has none. The signature binds the shop and the period, so the link can
 * neither be widened to another shop nor outlive its few minutes.
 */
export function createStatementToken(payload: StatementTokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body)}`
}

export function readStatementToken(token: string, now = Date.now()): StatementTokenPayload | null {
  const [body, signature] = token.split('.')
  if (!body || !signature)
    return null
  const expected = Buffer.from(sign(body))
  const received = Buffer.from(signature)
  if (expected.length !== received.length || !timingSafeEqual(expected, received))
    return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatementTokenPayload
    if (typeof payload.expiresAt !== 'number' || payload.expiresAt < now)
      return null
    return payload
  }
  catch {
    return null
  }
}
