export type StatementPreset = 'today' | 'week' | 'month' | 'custom'

export interface StatementPeriod {
  /** `YYYY-MM-DD`, both days included. */
  from: string
  to: string
}

/** `YYYY-MM-DD` of the phone's own calendar day — never through UTC. */
export function toDayString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function fromDayString(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date)
}

/** Today, the week from Monday, the month from the 1st — each up to today. */
export function presetPeriod(preset: Exclude<StatementPreset, 'custom'>, now = new Date()): StatementPeriod {
  const today = toDayString(now)
  if (preset === 'today')
    return { from: today, to: today }
  if (preset === 'week') {
    const daysSinceMonday = (now.getDay() + 6) % 7
    return { from: toDayString(new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday)), to: today }
  }
  return { from: toDayString(new Date(now.getFullYear(), now.getMonth(), 1)), to: today }
}

const SHORT_DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

/** « 11 novembre 2026 » or « 1 novembre 2026 → 11 novembre 2026 ». */
export function describePeriod(period: StatementPeriod): string {
  const from = SHORT_DATE.format(fromDayString(period.from))
  return period.from === period.to ? from : `${from} → ${SHORT_DATE.format(fromDayString(period.to))}`
}
