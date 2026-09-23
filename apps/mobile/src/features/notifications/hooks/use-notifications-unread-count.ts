import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'
import { NOTIFICATION_AUDIENCE } from '../../../utils/app-variant'

/** Assez rare pour ne rien coûter, assez fréquent pour ne pas mentir longtemps. */
const POLL_INTERVAL_MS = 60_000

/**
 * Notifications non lues de l'application courante.
 *
 * Le décompte vivait dans l'en-tête de l'accueil client, donc invisible pour
 * les deux autres applications. Il est ici parce qu'un badge d'onglet en a
 * besoin — et parce qu'un compteur enfermé dans un écran n'est pas un
 * compteur.
 *
 * L'audience suit la variante du build : un livreur ne compte pas les
 * notifications d'un acheteur.
 */
export function useNotificationsUnreadCount(): { count: number, refetch: () => void } {
  const [count, setCount] = useState(0)

  const refetch = useCallback(() => {
    void (async () => {
      try {
        const res = await apiFetch(`/api/notifications/count?audience=${NOTIFICATION_AUDIENCE}`)
        if (!res.ok) {
          return
        }
        const data = await res.json() as { count?: number }
        setCount(typeof data.count === 'number' ? data.count : 0)
      }
      catch {
        // Coupure passagère : on garde le dernier décompte connu.
      }
    })()
  }, [])

  useEffect(() => {
    refetch()
    const timer = setInterval(refetch, POLL_INTERVAL_MS)
    return () => {
      clearInterval(timer)
    }
  }, [refetch])

  return { count, refetch }
}
