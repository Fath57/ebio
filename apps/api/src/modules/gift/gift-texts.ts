import type { DeliveryWindow } from '../../common/delivery-window'
import { BadRequestException } from '@nestjs/common'
import { BENIN_UTC_OFFSET_MINUTES } from '../../common/delivery-window'

/** The relative lives in Benin: every time told to them is Cotonou time. */
export const BENIN_TIME_ZONE = 'Africa/Porto-Novo'

/** Resends of the recipient SMS the payer may ask for (FR-010). */
export const RECIPIENT_SMS_RESEND_LIMIT = 3

/** Past this distance from the delivery point, a hand-over proof is flagged for support (FR-015). */
export const GIFT_PROOF_FAR_METRES = 300

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS

/** A 400 the apps translate by its `code`, in the shape the rest of the API uses. */
export function giftBadRequest(code: string, message: string): BadRequestException {
  return new BadRequestException({ statusCode: 400, code, message })
}

/** « Awa » from « Awa Diallo »: the relative knows the payer by their first name. */
export function firstName(fullName: string | null | undefined): string {
  const first = (fullName ?? '').trim().split(/\s+/)[0]
  return first || 'Un proche'
}

/** « 10 h », « 10 h 30 », how a time is said in a text message. */
function spokenClock(hours: number, minutes: number): string {
  return minutes === 0 ? `${hours} h` : `${hours} h ${String(minutes).padStart(2, '0')}`
}

function beninLocal(instant: Date): Date {
  return new Date(instant.getTime() + BENIN_UTC_OFFSET_MINUTES * MINUTE_MS)
}

function beninDayIndex(instant: Date): number {
  return Math.floor(beninLocal(instant).getTime() / DAY_MS)
}

/** « 10 h 42 », Cotonou time. */
export function beninClock(instant: Date): string {
  const local = beninLocal(instant)
  return spokenClock(local.getUTCHours(), local.getUTCMinutes())
}

/**
 * The delivery window in the relative's words: « demain entre 10 h et 12 h »,
 * « aujourd'hui entre 14 h et 16 h », « le 20/11 entre 8 h et 10 h ».
 */
export function giftWindowPhrase(window: DeliveryWindow, now: Date): string {
  const hours = `entre ${beninClock(window.start)} et ${beninClock(window.end)}`
  const offset = beninDayIndex(window.start) - beninDayIndex(now)
  if (offset === 0) {
    return `aujourd'hui ${hours}`
  }
  if (offset === 1) {
    return `demain ${hours}`
  }
  const local = beninLocal(window.start)
  const day = String(local.getUTCDate()).padStart(2, '0')
  const month = String(local.getUTCMonth() + 1).padStart(2, '0')
  return `le ${day}/${month} ${hours}`
}

export function announceSms(payerName: string, window: DeliveryWindow | null, trackingUrl: string, now: Date): string {
  const when = window ? `, livré ${giftWindowPhrase(window, now)}` : ''
  return `${firstName(payerName)} vous envoie un panier eBio${when}. Suivi : ${trackingUrl}`
}

export function codeSms(code: string): string {
  return `Votre panier eBio arrive. Code à donner au livreur : ${code}`
}

export function cancellationSms(payerName: string): string {
  return `Le panier envoyé par ${firstName(payerName)} est annulé.`
}

/**
 * A moment in a given zone, for the payer abroad: « 9 h 42 (heure de Paris) ».
 * The zone's city is the last segment of its IANA name.
 */
export function clockIn(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('fr-FR', { timeZone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
    .formatToParts(instant)
  const hours = Number(parts.find(part => part.type === 'hour')?.value ?? 0)
  const minutes = Number(parts.find(part => part.type === 'minute')?.value ?? 0)
  return spokenClock(hours, minutes)
}

/** « Paris » from `Europe/Paris`, « New York » from `America/New_York`. */
export function zoneCity(timeZone: string): string {
  return (timeZone.split('/').pop() ?? timeZone).replace(/_/g, ' ')
}

/**
 * The hand-over time as the payer reads it: Benin time always, and their own
 * time beside it when their device told us its zone and it differs.
 */
export function handOverTimes(instant: Date, payerTimeZone: string | null | undefined): { benin: string, payer: string | null } {
  const benin = beninClock(instant)
  if (!payerTimeZone || payerTimeZone === BENIN_TIME_ZONE) {
    return { benin, payer: null }
  }
  try {
    const payer = clockIn(instant, payerTimeZone)
    return { benin, payer: payer === benin ? null : `${payer} (heure de ${zoneCity(payerTimeZone)})` }
  }
  catch {
    // An unknown zone was refused at checkout; one that vanished since is
    // simply left out rather than failing the message.
    return { benin, payer: null }
  }
}
