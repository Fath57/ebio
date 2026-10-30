/**
 * French grouping uses a narrow no-break space (U+202F) that Plus Jakarta
 * Sans lacks; a plain no-break space is in every font.
 */
function group(value: number, locale: string): string {
  return Math.round(value).toLocaleString(locale).replace(/\u202F/g, '\u00A0')
}

export function formatFcfa(value: number, locale: string): string {
  return `${group(value, locale)}\u00A0FCFA`
}

export function formatCount(value: number, locale: string): string {
  return group(value, locale)
}

export function formatRate(value: number, locale: string): string {
  return value.toLocaleString(locale, { style: 'percent', maximumFractionDigits: 1 })
}

/**
 * Relative change against the previous period, or `null` when there is
 * nothing to compare with (no activity before): "+100 %" from zero would lie.
 */
export function relativeChange(value: number, previous: number): number | null {
  if (previous === 0)
    return null
  return (value - previous) / previous
}
