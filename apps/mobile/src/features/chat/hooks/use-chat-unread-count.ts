import { useCallback, useEffect, useState } from 'react'
import { chatFetch } from '../../../utils/api-client'

const POLL_INTERVAL_MS = 30000

/**
 * Global unread chat messages count, for navigation badges.
 * Polls GET /api/chat/unread-count on mount then every 30 s.
 * Exposes refetch() so a consumer can refresh on demand (e.g. screen focus).
 */
export function useChatUnreadCount(): { count: number, refetch: () => void } {
  const [count, setCount] = useState(0)

  const refetch = useCallback(() => {
    void (async () => {
      try {
        const res = await chatFetch('/api/chat/unread-count')
        if (!res.ok)
          return
        const data = await res.json() as { count?: number }
        setCount(data.count ?? 0)
      }
      catch {
        // keep the previous count on a network hiccup
      }
    })()
  }, [])

  useEffect(() => {
    refetch()
    const interval = setInterval(() => {
      refetch()
    }, POLL_INTERVAL_MS)
    return () => {
      clearInterval(interval)
    }
  }, [refetch])

  return { count, refetch }
}
