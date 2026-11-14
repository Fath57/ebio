/**
 * Delivery window: when the buyer wants to be delivered, as two instants.
 *
 * The app now sends the window itself; the free-text slot stays for display
 * and for the app versions that still type it. Benin has no daylight saving,
 * so local time is a fixed UTC+1 offset.
 */
export const BENIN_UTC_OFFSET_MINUTES = 60

/** The courier search opens this long before the window starts. */
export const WINDOW_DISPATCH_LEAD_MINUTES = 60

/**
 * The pickup is expected from this long before the window starts: a courier
 * who accepts early is not held to a pickup the buyer does not want yet.
 */
export const WINDOW_PICKUP_LEAD_MINUTES = 30

/** Width given to a slot that names a single hour (« vers 14h »). */
const SINGLE_HOUR_WINDOW_MINUTES = 120

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS

export interface DeliveryWindow {
  start: Date
  end: Date
}

interface ClockTime {
  hours: number
  minutes: number
}

/**
 * Reads the format the app wrote for years, « Aujourd'hui entre 14h00 et
 * 16h00 », « Demain matin entre 8h et 12h ». Anything else yields null, which
 * means « as soon as ready »: guessing a time would start the search at the
 * wrong moment without anyone noticing.
 */
export function parseDeliverySlot(text: string | null | undefined, placedAt: Date): DeliveryWindow | null {
  if (!text) {
    return null
  }
  const normalized = text.toLowerCase().replace(/[’`]/g, '\'')
  const times = extractClockTimes(normalized)
  if (times.length === 0 || times.length > 2) {
    return null
  }
  const [startTime, endTime] = times
  const dayOffset = readDayOffset(normalized)
  const start = toBeninInstant(placedAt, dayOffset ?? 0, startTime)
  const end = endTime
    ? toBeninInstant(placedAt, dayOffset ?? 0, endTime)
    : new Date(start.getTime() + SINGLE_HOUR_WINDOW_MINUTES * MINUTE_MS)
  if (end.getTime() <= start.getTime()) {
    return null
  }
  // No day named and the window is already over: the buyer meant tomorrow.
  if (dayOffset === null && end.getTime() <= placedAt.getTime()) {
    return { start: new Date(start.getTime() + DAY_MS), end: new Date(end.getTime() + DAY_MS) }
  }
  return { start, end }
}

/** Display text for a window, in the words the app has always used. */
export function formatDeliveryWindow(window: DeliveryWindow, now: Date): string {
  const dayOffset = Math.round((beninMidnight(window.start).getTime() - beninMidnight(now).getTime()) / DAY_MS)
  const hours = `entre ${formatBeninClock(window.start)} et ${formatBeninClock(window.end)}`
  if (dayOffset === 0) {
    return `Aujourd'hui ${hours}`
  }
  if (dayOffset === 1) {
    return `Demain ${hours}`
  }
  const local = new Date(window.start.getTime() + BENIN_UTC_OFFSET_MINUTES * MINUTE_MS)
  const day = String(local.getUTCDate()).padStart(2, '0')
  const month = String(local.getUTCMonth() + 1).padStart(2, '0')
  return `Le ${day}/${month} ${hours}`
}

/** When the courier search should open for a window, or null without one. */
export function computeWindowDispatchAt(windowStart: Date | null | undefined): Date | null {
  if (!windowStart) {
    return null
  }
  return new Date(windowStart.getTime() - WINDOW_DISPATCH_LEAD_MINUTES * MINUTE_MS)
}

export interface PickupClockInput {
  acceptedAt: Date
  readyAt: Date
  windowStart: Date | null
}

/**
 * The pickup clock starts at the latest of three moments: the courier
 * accepted, the parcel was ready, the buyer's window is near. Counting from
 * acceptance alone took runs away from couriers who had nothing to collect yet.
 */
export function computePickupClockStart(input: PickupClockInput): Date {
  const candidates = [input.acceptedAt.getTime(), input.readyAt.getTime()]
  if (input.windowStart) {
    candidates.push(input.windowStart.getTime() - WINDOW_PICKUP_LEAD_MINUTES * MINUTE_MS)
  }
  return new Date(Math.max(...candidates))
}

export interface PickupDeadlines {
  warnAt: Date
  releaseAt: Date
}

export function computePickupDeadlines(input: PickupClockInput & { timeoutMinutes: number, warningMinutes: number }): PickupDeadlines {
  const releaseAt = new Date(computePickupClockStart(input).getTime() + input.timeoutMinutes * MINUTE_MS)
  return {
    warnAt: new Date(releaseAt.getTime() - input.warningMinutes * MINUTE_MS),
    releaseAt,
  }
}

function extractClockTimes(text: string): ClockTime[] {
  const times: ClockTime[] = []
  for (const match of text.matchAll(/(\d{1,2})\s*(?:h|:)\s*(\d{2})?/g)) {
    const hours = Number(match[1])
    const minutes = match[2] ? Number(match[2]) : 0
    if (hours > 23 || minutes > 59) {
      return []
    }
    times.push({ hours, minutes })
  }
  return times
}

/** Null when the text names no day: the caller then infers it. */
function readDayOffset(text: string): number | null {
  if (text.includes('après-demain') || text.includes('apres-demain') || text.includes('après demain')) {
    return 2
  }
  if (text.includes('demain')) {
    return 1
  }
  if (text.includes('aujourd') || text.includes('ce soir') || text.includes('ce matin') || text.includes('cet après-midi')) {
    return 0
  }
  return null
}

function beninMidnight(instant: Date): Date {
  const local = new Date(instant.getTime() + BENIN_UTC_OFFSET_MINUTES * MINUTE_MS)
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - BENIN_UTC_OFFSET_MINUTES * MINUTE_MS)
}

function toBeninInstant(reference: Date, dayOffset: number, time: ClockTime): Date {
  const midnight = beninMidnight(reference)
  return new Date(midnight.getTime() + dayOffset * DAY_MS + (time.hours * 60 + time.minutes) * MINUTE_MS)
}

/** « 14h05 », Cotonou time. */
export function formatBeninClock(instant: Date): string {
  const local = new Date(instant.getTime() + BENIN_UTC_OFFSET_MINUTES * MINUTE_MS)
  return `${local.getUTCHours()}h${String(local.getUTCMinutes()).padStart(2, '0')}`
}
