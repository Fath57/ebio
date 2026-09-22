import { useCallback, useEffect, useState } from 'react'
import { chatFetch } from '../../../utils/api-client'
import { websocketClient } from '../../../utils/websocket-client'

const POLL_INTERVAL_MS = 30000

/**
 * Global unread chat messages count, for navigation badges.
 * Polls GET /api/chat/unread-count on mount then every 30 s, and refreshes
 * immediately on any message the socket delivers — a badge that lags half a
 * minute behind the conversation it counts is worse than none.
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
    const unsubscribe = websocketClient.addMessageListener(() => {
      refetch()
    })
    return () => {
      clearInterval(interval)
      unsubscribe()
    }
  }, [refetch])

  return { count, refetch }
}
