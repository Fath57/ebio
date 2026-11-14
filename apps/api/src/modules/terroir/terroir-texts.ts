import { HttpException, HttpStatus } from '@nestjs/common'

/** An error the apps translate by its `code`, in the shape the rest of the API uses. */
export function terroirError(status: HttpStatus, code: string, message: string): HttpException {
  return new HttpException({ statusCode: status, code, message }, status)
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** « 22 novembre » from a `YYYY-MM-DD` day, whatever the server's time zone. */
export function spokenDay(isoDay: string): string {
  const [, month, day] = isoDay.split('-').map(Number)
  return `${day} ${MONTHS[month - 1] ?? ''}`.trim()
}

/** `YYYY-MM-DD` a number of days after another, on the calendar. */
export function addDays(isoDay: string, days: number): string {
  const date = new Date(`${isoDay}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** « Awa D. »: what the back office shows of a buyer in a list. */
export function shortName(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    return 'Client'
  }
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`
}
