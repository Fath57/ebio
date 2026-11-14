import type { Delivery } from '../types'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useRef, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'

/** The courier's current job, first active delivery (one at a time in practice). */
export function useActiveDelivery() {
  const [delivery, setDelivery] = useState<Delivery | null>(null)
  const [loading, setLoading] = useState(true)
  // Collections reported failed: back on offer without a courier, they must not
  // linger on screen while the queued failure waits for the network.
  const released = useRef(new Set<string>())

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch('/api/deliveries/mine?status=active')
      if (!res.ok) {
        return
      }
      const list = await res.json() as Delivery[]
      setDelivery(list.find(item => !released.current.has(item.id)) ?? null)
    }
    catch {
      // Offline: keep the cached delivery, transitions queue locally anyway.
    }
    finally {
      setLoading(false)
    }
  }, [])

  // Re-read on every focus: the proof screen (and the chat) pop back here
  // after a transition, and the mount-only fetch left a delivered run on screen.
  useFocusEffect(
    useCallback(() => {
      refresh()
    }, [refresh]),
  )

  /**
   * Puts a delivery on screen at once, the one just accepted, and confirms
   * it with the server behind. Without it the courier stared at the offer
   * list until they pulled to refresh.
   */
  const show = useCallback((accepted: Delivery) => {
    // Accepted again after a failure: it is ours once more.
    released.current.delete(accepted.id)
    setDelivery(accepted)
    refresh()
  }, [refresh])

  /** Drops a run the courier no longer holds (a failed collection, re-offered). */
  const release = useCallback((id: string) => {
    released.current.add(id)
    setDelivery(current => (current?.id === id ? null : current))
  }, [])

  return { delivery, loading, refresh, show, release }
}
