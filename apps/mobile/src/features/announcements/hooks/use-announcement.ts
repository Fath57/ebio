import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'

export interface Announcement {
  id: string
  /** Null when the announcement is a poster alone. */
  title: string | null
  subtitle: string | null
  imageUrl: string | null
  targetType: 'SUPPLIER' | 'PRODUCT' | 'URL' | 'NONE'
  targetId: string | null
  /** The shop that paid for it; null for an eBio announcement. */
  shopName: string | null
}

/**
 * The announcement to show on opening, if there is one.
 *
 * The server decides: it knows what this person has already seen and when, and
 * it returns only one. So the app has nothing to arbitrate — it opens a modal
 * or it does not.
 *
 * "Seen" is reported on display rather than on dismissal: someone who kills
 * the app without closing the modal has seen it anyway, and finding it again
 * on every launch would be unbearable.
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
        // Offline: no announcement, and above all no error screen for it.
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
