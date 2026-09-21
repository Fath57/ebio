import type { ActiveRun } from '../types'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'

/**
 * La tournée que le livreur exécute, ou rien.
 *
 * Elle prime sur la course isolée : tant qu'une tournée est en cours, ses
 * collectes ne sont pas des courses séparées, et les montrer comme telles
 * laisserait croire au livreur qu'il peut en abandonner une.
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
      // Hors ligne : on garde la tournée en cache, les transitions se mettent
      // de toute façon en file locale.
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
