import { Injectable, Logger } from '@nestjs/common'
import { config } from '../config/env.config'

/**
 * Wirepick's answer, when it answers at all.
 *
 * XML rather than JSON, and `ACT` is the only status that means the message
 * left. Anything else is a refusal dressed as a 200.
 */
function statusFrom(body: string): { ok: boolean, status: string | null, messageId: string | null } {
  // Whitespace is trimmed afterwards rather than matched: padding the capture
  // with `\s*` on both sides gives the engine two ways to read the same text,
  // which is how a tag turns into a stall.
  const status = /<status>([^<]*)<\/status>/i.exec(body)?.[1]?.trim() ?? null
  const messageId = /<msgid>([^<]*)<\/msgid>/i.exec(body)?.[1]?.trim() ?? null
  return { ok: status === 'ACT', status, messageId: messageId || null }
}

/**
 * What a refusal actually means, in words.
 *
 * Wirepick answers 200 whatever happens and refuses with three letters. The
 * wording comes from the operator's own table — guessing at them is how `NCR`
 * gets read as "no credit", which it is not.
 */
const REFUSALS: Record<string, string> = {
  NCR: 'aucune route configurée pour ce compte chez Wirepick — à faire provisionner par l\'opérateur',
  NSF: 'compte Wirepick sans crédit',
  INV: 'numéro de destination invalide',
  PHN: 'longueur de numéro invalide',
  LEN: 'message trop long',
  MAX: 'quota quotidien atteint',
  MAP: 'quota quotidien atteint chez l\'opérateur',
  NPZ: 'tarif réseau non configuré chez Wirepick',
  PNP: 'opérateur non provisionné',
  IPV: 'adresse IP appelante non autorisée',
  NRC: 'pas d\'accusé de réception de l\'opérateur (le message est tout de même facturé)',
}

function explain(status: string | null, body: string): string {
  if (status && REFUSALS[status]) {
    return `${REFUSALS[status]} (${status})`
  }
  if (/SND-Unregistered/i.test(body)) {
    return 'expéditeur non enregistré pour ce compte Wirepick'
  }
  if (/PWD-Invalid/i.test(body)) {
    return 'identifiants Wirepick refusés'
  }
  return status ? `refus Wirepick : ${status}` : 'réponse inattendue'
}

/** Wirepick wants a bare number; everything else here carries the `+`. */
function forWirepick(phone: string): string {
  const trimmed = phone.trim()
  return trimmed.startsWith('+') ? trimmed.slice(1) : trimmed
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name)

  private get configured(): boolean {
    return Boolean(config.sms.url && config.sms.user && config.sms.password && config.sms.senderId)
  }

  /**
   * Sends one message, and says plainly when it did not.
   *
   * Without credentials the message goes to the log instead of the network —
   * a developer reads their own code there, and a test environment must not
   * spend money. Presence of the credentials is the deliberate act, not the
   * environment name: a staging box with real keys is meant to send.
   */
  async send(phone: string, message: string): Promise<void> {
    if (!this.configured) {
      this.logger.warn(`[SMS-DEV] → ${phone}: ${message}`)
      return
    }

    const url = new URL(config.sms.url)
    url.searchParams.set('from', config.sms.senderId)
    url.searchParams.set('client', config.sms.user ?? '')
    url.searchParams.set('password', config.sms.password ?? '')
    url.searchParams.set('phone', forWirepick(phone))
    url.searchParams.set('text', message)

    let body: string
    try {
      const res = await fetch(url, { method: 'GET' })
      body = await res.text()

      if (!res.ok) {
        // The credentials are in the query string, so the URL never goes to
        // the log — only what came back.
        this.logger.error(`SMS refusé (${res.status}) pour ${phone} : ${body.slice(0, 200)}`)
        throw new Error('SMS send failed')
      }
    }
    catch (error) {
      if (error instanceof Error && error.message === 'SMS send failed') {
        throw error
      }
      this.logger.error(`SMS injoignable pour ${phone} — ${error}`)
      throw new Error('SMS send failed')
    }

    const { ok, status, messageId } = statusFrom(body)
    if (!ok) {
      // A 200 with a refusal inside is the failure that costs the most time:
      // without this the code above would call it a success.
      this.logger.error(`SMS non envoyé à ${phone} — ${explain(status, body)}`)
      throw new Error('SMS send failed')
    }

    // Said at a level production prints, and with the identifier Wirepick
    // gives back. `ACT` means they accepted and billed the message, not that a
    // handset received it — when one never arrives, this identifier is the only
    // thing that can be put in front of them.
    this.logger.log(`[SMS] → ${phone} : accepté par Wirepick${messageId ? ` (msgid ${messageId})` : ' (sans identifiant)'}`)
  }
}
