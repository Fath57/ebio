import { useCallback, useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { apiFetch } from '../../../utils/api-client'

const POLL_INTERVAL_MS = 30000

/**
 * Orders waiting for the shop's answer (status PLACED), for the tab badge.
 * Polls every 30 s, re-checks when the app returns to the foreground, and
 * exposes refetch() for consumers that just changed an order.
 */
export function usePendingOrdersCount(): { count: number, refetch: () => void } {
  const [count, setCount] = useState(0)

  const refetch = useCallback(() => {
    void (async () => {
      try {
        const res = await apiFetch('/api/orders?status=PLACED&limit=1')
        if (!res.ok)
          return
        const data = await res.json() as { total?: number, orders?: unknown[] }
        setCount(typeof data.total === 'number' ? data.total : (data.orders?.length ?? 0))
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
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refetch()
      }
    })
    return () => {
      clearInterval(interval)
      sub.remove()
    }
  }, [refetch])

  return { count, refetch }
}
