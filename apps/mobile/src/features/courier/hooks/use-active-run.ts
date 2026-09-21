import type { ActiveRun } from '../types'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'

/**
 * The run the courier is riding, or nothing.
 *
 * It takes precedence over the lone delivery: while a run is on, its
 * pickups are not separate deliveries, and showing them as such would
 * laisserait croire au livreur they can drop one of them.
 */
export function useActiveRun() {
  const [run, setRun] = useState<ActiveRun | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch('/api/runs/mine')
      if (!res.ok) {
        return
      }
      const body = await res.text()
      setRun(body.length > 0 ? JSON.parse(body) as ActiveRun : null)
    }
    catch {
      // Offline: the cached run is kept, transitions queue locally
      // anyway.
    }
    finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      refresh()
    }, [refresh]),
  )

  return { run, loading, refresh }
}
