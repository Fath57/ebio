import type { Delivery } from '../types'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'

/** The courier's current job — first active delivery (one at a time in practice). */
export function useActiveDelivery() {
  const [delivery, setDelivery] = useState<Delivery | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch('/api/deliveries/mine?status=active')
      if (!res.ok) {
        return
      }
      const list = await res.json() as Delivery[]
      setDelivery(list[0] ?? null)
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

  return { delivery, loading, refresh }
}
