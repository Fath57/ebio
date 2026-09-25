import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'

export interface Announcement {
  id: string
  /** Nul quand l'annonce est un visuel seul. */
  title: string | null
  subtitle: string | null
  imageUrl: string | null
  targetType: 'SUPPLIER' | 'PRODUCT' | 'URL' | 'NONE'
  targetId: string | null
  /** La boutique qui l'a payée ; nul pour une annonce d'eBio. */
  shopName: string | null
}

/**
 * L'annonce à montrer à l'ouverture, s'il y en a une.
 *
 * Le serveur décide : il sait ce que cette personne a déjà vu et depuis quand,
 * et il n'en rend qu'une. L'application n'a donc rien à arbitrer — elle ouvre
 * un modal ou n'en ouvre pas.
 *
 * « Vue » est signalé à l'affichage et non à la fermeture : quelqu'un qui tue
 * l'application sans fermer le modal l'a vue quand même, et la retrouver à
 * chaque lancement serait insupportable.
 */
export function useAnnouncement(): {
  announcement: Announcement | null
  dismiss: () => void
} {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      try {
        const res = await apiFetch('/api/announcements/current')
        if (!res.ok || cancelled) {
          return
        }

        const data = await res.json() as { announcement: Announcement | null }
        if (data.announcement === null) {
          return
        }

        setAnnouncement(data.announcement)
        void apiFetch(`/api/announcements/${data.announcement.id}/seen`, { method: 'POST' })
      }
      catch {
        // Hors ligne : pas d'annonce, et surtout pas d'écran d'erreur pour ça.
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const dismiss = useCallback(() => {
    setAnnouncement(null)
  }, [])

  return { announcement, dismiss }
}
