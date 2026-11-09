/**
 * Delivery windows are typed in Cotonou time whatever the browser's zone:
 * the support desk may work from Paris, the buyer and the courier do not.
 * Benin has no daylight saving, so the offset is fixed.
 */
const BENIN_OFFSET = '+01:00'
const BENIN_OFFSET_MS = 60 * 60 * 1000

/** Until the courier leaves with the parcel, the window can still move. */
export const WINDOW_EDITABLE_ORDER_STATUSES = new Set(['PENDING_PAYMENT', 'PLACED', 'ACCEPTED', 'PREPARING', 'READY'])

export interface BeninDateTime {
  /** `YYYY-MM-DD` */
  date: string
  /** `HH:MM` */
  time: string
}

export function toBeninDateTime(iso: string | Date): BeninDateTime {
  const local = new Date(new Date(iso).getTime() + BENIN_OFFSET_MS).toISOString()
  return { date: local.slice(0, 10), time: local.slice(11, 16) }
}

export function fromBeninDateTime({ date, time }: BeninDateTime): string {
  return new Date(`${date}T${time}:00${BENIN_OFFSET}`).toISOString()
}

/** « 09/11 14:00 → 16:00 », Cotonou time. */
export function formatBeninWindow(start: string, end: string): string {
  const from = toBeninDateTime(start)
  const to = toBeninDateTime(end)
  const [, month, day] = from.date.split('-')
  const endLabel = to.date === from.date ? to.time : `${to.date.split('-').reverse().slice(0, 2).join('/')} ${to.time}`
  return `${day}/${month} ${from.time} → ${endLabel}`
}
