import { client } from '@boilerstone/openapi-generator'

export type BusinessCardsRequest = { all: true } | { supplierIds: string[] }

const COMBINING_MARKS = /\p{M}/gu
const NON_SLUG_CHARACTERS = /[^a-z0-9]+/g
const EDGE_DASHES = /^-|-$/g

/** `delice-des-rois`: a shop name, safe in a file name. */
function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(NON_SLUG_CHARACTERS, '-')
    .replace(EDGE_DASHES, '')
}

export function singleCardFilename(shopName: string): string {
  return `carte-de-visite-${slugify(shopName)}.pdf`
}

export function batchFilename(): string {
  return `cartes-de-visite-ebio-${new Date().toISOString().slice(0, 10)}.pdf`
}

/**
 * Asks the API for the sheets and hands the PDF to the browser. A binary
 * answer has no use for the generated SDK's parsing, so this goes through its
 * client directly, as the CSV exports do.
 */
export async function downloadBusinessCards(request: BusinessCardsRequest, filename: string): Promise<void> {
  const result = await client.post({
    url: '/api/admin/business-cards',
    body: request,
    headers: { 'Content-Type': 'application/json' },
    parseAs: 'blob',
  })
  if (result.error || !(result.data instanceof Blob))
    throw new Error('Business cards generation failed')

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
