/**
 * Delivery slot picked at checkout: as soon as possible, or a two-hour range
 * today or tomorrow. The server receives the window as two instants, plus the
 * text that every screen has always shown.
 *
 * Hours are Cotonou time (UTC+1, no daylight saving) whatever the phone's
 * zone: a buyer abroad ordering for their family must see the shop's hours.
 */
const BENIN_OFFSET_MS = 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
/** Couriers work from 8 h to 20 h; one range per two hours. */
export const SLOT_START_HOURS = [8, 10, 12, 14, 16, 18] as const
const SLOT_LENGTH_HOURS = 2
/**
 * A range stays offered today while at least this much of it remains: enough
 * for the shop to prepare and a courier to ride. Counting from the end rather
 * than the start keeps 8h–10h open at 7h30, when it is still easily reachable.
 */
const MIN_REMAINING_HOURS = 1.5

export type SlotDay = 0 | 1

export type SlotChoice = { kind: 'asap' } | { kind: 'window', day: SlotDay, startHour: number }

export const ASAP_CHOICE: SlotChoice = { kind: 'asap' }

export interface SlotWindow {
  start: string
  end: string
  label: string
}

function beninHour(now: Date): number {
  const local = new Date(now.getTime() + BENIN_OFFSET_MS)
  return local.getUTCHours() + local.getUTCMinutes() / 60
}

/** The ranges still open on a given day. */
export function availableStartHours(day: SlotDay, now: Date): number[] {
  if (day === 1) {
    return [...SLOT_START_HOURS]
  }
  const currentHour = beninHour(now)
  return SLOT_START_HOURS.filter(hour => hour + SLOT_LENGTH_HOURS - currentHour >= MIN_REMAINING_HOURS)
}

export function formatSlotLabel(choice: SlotChoice): string {
  if (choice.kind === 'asap') {
    return 'Dès que possible'
  }
  const day = choice.day === 0 ? 'Aujourd\'hui' : 'Demain'
  return `${day} entre ${choice.startHour}h00 et ${choice.startHour + SLOT_LENGTH_HOURS}h00`
}

/** Null for « as soon as possible »: the server then dispatches once the parcel is ready. */
export function toSlotWindow(choice: SlotChoice, now: Date): SlotWindow | null {
  if (choice.kind === 'asap') {
    return null
  }
  const local = new Date(now.getTime() + BENIN_OFFSET_MS)
  const beninMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - BENIN_OFFSET_MS
  const start = beninMidnight + choice.day * 24 * HOUR_MS + choice.startHour * HOUR_MS
  return {
    start: new Date(start).toISOString(),
    end: new Date(start + SLOT_LENGTH_HOURS * HOUR_MS).toISOString(),
    label: formatSlotLabel(choice),
  }
}

/** Draft key: « asap », « 0:14 », « 1:8 ». */
export function encodeSlotChoice(choice: SlotChoice): string {
  return choice.kind === 'asap' ? 'asap' : `${choice.day}:${choice.startHour}`
}

/**
 * A draft written before the picker held free text: it cannot be read back,
 * and a stale range from yesterday is no better, both fall back to « asap ».
 */
export function decodeSlotChoice(key: string | undefined, now: Date): SlotChoice {
  const match = key?.match(/^([01]):(\d{1,2})$/)
  if (!match) {
    return ASAP_CHOICE
  }
  const day = Number(match[1]) as SlotDay
  const startHour = Number(match[2])
  if (!availableStartHours(day, now).includes(startHour)) {
    return ASAP_CHOICE
  }
  return { kind: 'window', day, startHour }
}
