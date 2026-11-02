import { client } from '@boilerstone/openapi-generator'

/**
 * Fetch a CSV export through the API client and hand it to the browser as a file.
 *
 * Opening the export URL in a new tab does not work here: the path is relative,
 * so it lands on the back office's own domain (which answers with the app's
 * HTML) instead of the API's. Going through the client keeps the API base URL
 * and the session cookie, and lets a failure surface instead of an empty tab.
 */
export async function downloadCsv(path: string, filename: string): Promise<void> {
  const result = await client.get({ url: path, parseAs: 'blob' })
  if (result.error || !(result.data instanceof Blob))
    throw new Error('Export failed')

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

/** `commandes-2026-11-02.csv`: the date tells two exports apart in the downloads folder. */
export function datedFilename(base: string): string {
  return `${base}-${new Date().toISOString().slice(0, 10)}.csv`
}
