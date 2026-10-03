/** The slice of a list one page asks for. */
export interface PageWindow {
  limit: number
  offset: number
}

/** No page may ask for more than this, whatever the query says. */
const MAX_PAGE_SIZE = 50

/**
 * Reads optional `page` / `limit` query values into a window.
 *
 * Returns `null` when no `limit` was sent: the list then behaves as it did
 * before it was paginated. The apps already in buyers' hands send no limit and
 * must keep receiving the whole list in the same shape.
 */
export function readPageWindow(page?: string, limit?: string): PageWindow | null {
  const size = Number.parseInt(limit ?? '', 10)
  if (!Number.isFinite(size) || size < 1) {
    return null
  }
  const boundedSize = Math.min(size, MAX_PAGE_SIZE)
  const pageNumber = Math.max(Number.parseInt(page ?? '', 10) || 1, 1)
  return { limit: boundedSize, offset: (pageNumber - 1) * boundedSize }
}
