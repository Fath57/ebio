import { BadRequestException } from '@nestjs/common'
import { MAX_STATEMENT_DAYS } from './contracts/sales-statement.contract'

const DAY_MS = 86_400_000

/** How far ahead of UTC the zone's wall clock stands at that instant. */
export function zoneOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(p => p.type === type)?.value ?? 0)
  const wallClockAsUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'))
  return wallClockAsUtc - Math.floor(at.getTime() / 1000) * 1000
}

/** The instant a calendar day starts in that zone. */
function startOfDay(day: string, timeZone: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  const midnightUtc = Date.UTC(year, month - 1, date)
  return new Date(midnightUtc - zoneOffsetMs(timeZone, new Date(midnightUtc)))
}

function nextDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10)
}

export interface StatementRange {
  from: string
  to: string
  /** Inclusive. */
  start: Date
  /** Exclusive: the first instant of the day after `to`. */
  end: Date
}

/**
 * The two calendar days, both included, as instants in the shop's zone, the
 * shop's « aujourd'hui » ends at its own midnight, not the server's.
 */
export function statementRange(from: string, to: string, timeZone: string): StatementRange {
  const fromMs = Date.parse(from)
  const toMs = Date.parse(to)
  if (Number.isNaN(fromMs) || Number.isNaN(toMs))
    throw new BadRequestException('Date invalide')
  if (fromMs > toMs)
    throw new BadRequestException('La date de début doit précéder la date de fin')
  if ((toMs - fromMs) / DAY_MS >= MAX_STATEMENT_DAYS)
    throw new BadRequestException('Une période couvre au plus un an')
  return { from, to, start: startOfDay(from, timeZone), end: startOfDay(nextDay(to), timeZone) }
}

const LONG_DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** « le 11 novembre 2026 » or « du 1 novembre 2026 au 30 novembre 2026 ». */
export function periodLabel(from: string, to: string): string {
  const format = (day: string) => LONG_DATE.format(new Date(`${day}T00:00:00Z`))
  return from === to ? `le ${format(from)}` : `du ${format(from)} au ${format(to)}`
}
