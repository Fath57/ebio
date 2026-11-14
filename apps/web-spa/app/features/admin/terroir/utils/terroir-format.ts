const FR_DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const FR_DATE_TIME = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Non-breaking spaces, so « 82,4 kg » never wraps. */
function nbsp(value: string): string {
  return value.replace(/\u202F/g, '\u00A0')
}

/** Kilos with one decimal at most, French style: « 82,4 ». */
export function formatKgValue(kg: number): string {
  return nbsp(kg.toLocaleString('fr-FR', { maximumFractionDigits: 1 }))
}

export function formatKg(kg: number): string {
  return `${formatKgValue(kg)}\u00A0kg`
}

/** Grams shown as kilos past one kilo: « 850 g », « 3,2 kg ». */
export function formatGrams(grams: number): string {
  if (grams < 1000)
    return `${nbsp(grams.toLocaleString('fr-FR'))}\u00A0g`
  return nbsp(`${(grams / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}\u00A0kg`)
}

/** A `YYYY-MM-DD` day, read as a calendar day whatever the browser's zone. */
export function formatDay(isoDay: string): string {
  const date = new Date(`${isoDay.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? isoDay : FR_DAY.format(date)
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso)
    return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : FR_DATE_TIME.format(date)
}

/** A percentage from a ratio (0.824 → « 82 % »). */
export function formatRatio(ratio: number): string {
  return `${Math.round(ratio * 100).toLocaleString('fr-FR')}\u00A0%`
}
