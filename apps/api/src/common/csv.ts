/**
 * CSV for the back office, shaped for the spreadsheet people actually open it in.
 *
 * - `;` separates columns: a French Excel reads `,` as the decimal mark.
 * - A UTF-8 byte-order mark leads the file: without it Excel decodes it as
 *   Windows-1252 and every « é » comes out as « Ã© ».
 * - A field holding `;`, a quote or a line break is quoted, quotes doubled,
 *   otherwise a shop named « Chez Ami; Fils » shifts every column after it.
 * - Lines end in CRLF, as RFC 4180 asks.
 */
const SEPARATOR = ';'
const BOM = '﻿'

export type CsvValue = string | number | null | undefined

function escapeField(value: CsvValue): string {
  if (value === null || value === undefined)
    return ''
  const text = String(value)
  return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv(header: string[], rows: CsvValue[][]): string {
  const lines = [header, ...rows].map(row => row.map(escapeField).join(SEPARATOR))
  return BOM + lines.join('\r\n')
}

/** `YYYY-MM-DD HH:mm` in Porto-Novo time, readable as-is in a spreadsheet. */
export function csvDateTime(value: unknown): string {
  if (!value)
    return ''
  const date = value instanceof Date ? value : new Date(value as string)
  if (Number.isNaN(date.getTime()))
    return ''
  return date.toLocaleString('sv-SE', { timeZone: 'Africa/Porto-Novo', hour12: false }).slice(0, 16)
}
