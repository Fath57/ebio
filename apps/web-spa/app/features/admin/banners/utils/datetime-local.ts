/**
 * Bridges ISO timestamps from the API and the `YYYY-MM-DDTHH:mm` strings a
 * `datetime-local` input speaks, in the browser's local time zone.
 */

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** ISO (or nothing) → input value; empty when there is no date. */
export function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso)
    return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime()))
    return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Input value → ISO; an empty field means "no date" and becomes null. */
export function fromDateTimeLocal(value: string): string | null {
  if (!value)
    return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
