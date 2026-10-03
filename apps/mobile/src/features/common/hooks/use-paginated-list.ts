import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

/** The size every history screen asks for. */
export const PAGE_SIZE = 20

/** One page as a screen hands it back: its rows and whether more follow. */
export interface Page<T> {
  items: T[]
  hasMore: boolean
}

/** For endpoints that report a total: is there anything past this page? */
export function hasMoreAfter(page: number, limit: number, total: number): boolean {
  return page * limit < total
}

/**
 * For endpoints that return a bare array: a full page means there may be
 * another; a short one means the list is over.
 */
export function hasMoreFromLength(received: number, limit: number): boolean {
  return received >= limit
}

interface PaginatedList<T> {
  items: T[]
  /** Only true for the very first page: the screen shows its skeleton. */
  isLoading: boolean
  isRefreshing: boolean
  isLoadingMore: boolean
  hasMore: boolean
  error: string | null
  /** Pull-to-refresh: starts again from the first page. */
  refresh: () => Promise<void>
  /** Wire to `onEndReached`: no-op while a page is in flight or at the end. */
  loadMore: () => Promise<void>
  /** For local edits (mark as read, cancel…) without a refetch. */
  setItems: Dispatch<SetStateAction<T[]>>
}

/**
 * Infinite scroll for the history screens.
 *
 * `fetchPage` is read from a ref, so callers need not memoize it; change
 * `resetKey` (a filter, a tab) to start over from the first page. A response
 * that arrives after a newer request was made is dropped, and rows already on
 * screen are not repeated when the list shifted between two pages.
 */
export function usePaginatedList<T extends { id: string }>(
  fetchPage: (page: number) => Promise<Page<T>>,
  resetKey: unknown = null,
): PaginatedList<T> {
  const [items, setItems] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRef = useRef(fetchPage)
  fetchRef.current = fetchPage
  const pageRef = useRef(0)
  const requestRef = useRef(0)
  const busyRef = useRef(false)

  const loadFirstPage = useCallback(async (mode: 'initial' | 'refresh') => {
    const request = ++requestRef.current
    busyRef.current = true
    if (mode === 'refresh') {
      setIsRefreshing(true)
    }
    else {
      setIsLoading(true)
    }
    try {
      const result = await fetchRef.current(1)
      if (request !== requestRef.current) {
        return
      }
      pageRef.current = 1
      setItems(result.items)
      setHasMore(result.hasMore)
      setError(null)
    }
    catch (err) {
      if (request === requestRef.current) {
        setError(err instanceof Error ? err.message : 'Chargement impossible')
      }
    }
    finally {
      if (request === requestRef.current) {
        busyRef.current = false
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    loadFirstPage('initial')
  }, [loadFirstPage, resetKey])

  const refresh = useCallback(() => loadFirstPage('refresh'), [loadFirstPage])

  const loadMore = useCallback(async () => {
    if (busyRef.current || !hasMore) {
      return
    }
    const request = requestRef.current
    const next = pageRef.current + 1
    busyRef.current = true
    setIsLoadingMore(true)
    try {
      const result = await fetchRef.current(next)
      if (request !== requestRef.current) {
        return
      }
      pageRef.current = next
      setItems((current) => {
        const seen = new Set(current.map(item => item.id))
        return [...current, ...result.items.filter(item => !seen.has(item.id))]
      })
      setHasMore(result.hasMore)
    }
    catch {
      // The rows already shown stay; scrolling to the end again retries.
    }
    finally {
      if (request === requestRef.current) {
        busyRef.current = false
        setIsLoadingMore(false)
      }
    }
  }, [hasMore])

  return { items, isLoading, isRefreshing, isLoadingMore, hasMore, error, refresh, loadMore, setItems }
}
