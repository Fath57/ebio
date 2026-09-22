import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchSupportUnread } from './support-queries'

/** Fast enough to feel live, slow enough to be a rounding error on the API. */
const POLL_INTERVAL_MS = 5000

/**
 * The unread support counter behind the header badge.
 *
 * Polling rather than a socket: the chat gateway authenticates with the JWT
 * the apps carry, which a back-office session does not hold. One indexed
 * count every five seconds buys the same "it just appeared" feeling without
 * a second authentication path to maintain.
 *
 * The timer stops while the tab is hidden and fires once on return, so a
 * back-office left open all night costs nothing and is still up to date the
 * moment someone looks at it.
 */
export function useSupportUnread(enabled: boolean): number {
  const [count, setCount] = useState(0)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) {
      return
    }
    inFlight.current = true
    try {
      setCount((await fetchSupportUnread()).threads)
    }
    finally {
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      return
    }

    let timer: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (timer === null) {
        timer = setInterval(() => {
          void refresh()
        }, POLL_INTERVAL_MS)
      }
    }
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refresh()
        start()
      }
      else {
        stop()
      }
    }

    void refresh()
    start()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, refresh])

  return count
}
