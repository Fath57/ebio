import { client } from '@boilerstone/openapi-generator'

export type StatementPreset = 'today' | 'week' | 'month' | 'lastMonth' | 'custom'

export interface StatementPeriod {
  /** `YYYY-MM-DD`, both days included, read by the API in the shop's time zone. */
  from: string
  to: string
}

const COMBINING_MARKS = /\p{M}/gu
const NON_SLUG_CHARACTERS = /[^a-z0-9]+/g
const EDGE_DASHES = /^-|-$/g

/** `YYYY-MM-DD` of the local calendar day — never through UTC. */
export function toDayString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function presetPeriod(preset: Exclude<StatementPreset, 'custom'>, now = new Date()): StatementPeriod {
  const today = toDayString(now)
  const year = now.getFullYear()
  const month = now.getMonth()
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'week': {
      const daysSinceMonday = (now.getDay() + 6) % 7
      return { from: toDayString(new Date(year, month, now.getDate() - daysSinceMonday)), to: today }
    }
    case 'month':
      return { from: toDayString(new Date(year, month, 1)), to: today }
    case 'lastMonth':
      return { from: toDayString(new Date(year, month - 1, 1)), to: toDayString(new Date(year, month, 0)) }
  }
}

export function statementFilename(shopName: string, period: StatementPeriod): string {
  const slug = shopName.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().replace(NON_SLUG_CHARACTERS, '-').replace(EDGE_DASHES, '')
  const span = period.from === period.to ? period.from : `${period.from}_${period.to}`
  return `releve-ventes-${slug || 'boutique'}-${span}.xlsx`
}

async function readError(error: unknown): Promise<string | undefined> {
  const body = error as { message?: string, aggregateErrors?: Array<{ message?: string }> } | undefined
  return body?.aggregateErrors?.[0]?.message ?? body?.message
}

/**
 * The Excel file goes straight to the browser. A binary answer has no use for
 * the generated SDK's parsing, so this goes through its client, as the
 * business cards do.
 */
export async function downloadSalesStatement(supplierId: string, period: StatementPeriod, filename: string): Promise<void> {
  const result = await client.post({
    url: '/api/admin/suppliers/{supplierId}/sales-statement',
    path: { supplierId },
    body: period,
    headers: { 'Content-Type': 'application/json' },
    parseAs: 'blob',
  })
  if (result.error || !(result.data instanceof Blob))
    throw new Error(await readError(result.error) ?? 'Sales statement generation failed')

  const url = URL.createObjectURL(result.data)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoked on the next tick: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Returns the address the statement went to. */
export async function sendSalesStatement(supplierId: string, period: StatementPeriod, email: string): Promise<string> {
  const result = await client.post({
    url: '/api/admin/suppliers/{supplierId}/sales-statement/email',
    path: { supplierId },
    body: { ...period, email },
    headers: { 'Content-Type': 'application/json' },
  })
  if (result.error)
    throw new Error(await readError(result.error) ?? 'Sales statement e-mail failed')
  return (result.data as { sentTo: string }).sentTo
}
