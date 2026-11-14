import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useSession } from '../../../lib/auth-client'
import { apiFetch } from '../../../utils/api-client'

/**
 * How long the app must stay in the background for a return to count as a new
 * opening.
 *
 * A hosted payment page, a permission dialog or a photo picker all leave the
 * app for a moment: coming back from them is not opening it.
 */
const NEW_OPENING_AFTER_MS = 5 * 60 * 1000

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
 * it returns only one. So the app has nothing to arbitrate, it opens a modal
 * or it does not.
 *
 * It asks on every opening, which is more than a cold start: an app sent to the
 * background and brought back hours later, or a visitor who has just signed in,
 * would otherwise miss everything published since the process started.
 *
 * "Seen" is reported by the modal once it is on screen, not when the server
 * answers: a poster still being measured when the app is left has not been
 * seen, and counting it would hide it until the interval has passed.
 *
 * @param canInterrupt Whether the current screen tolerates a modal. Called just
 * before asking, so an opening refused here is simply tried again at the next.
 */
export function useAnnouncement(canInterrupt: () => boolean): {
  announcement: Announcement | null
  dismiss: () => void
  markSeen: (id: string) => void
} {
  const { data: session } = useSession()
  const userId = session?.user?.id ?? null
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const isOpen = useRef(false)

  useEffect(() => {
    // The route requires a session: without one, asking can only fail.
    if (userId === null) {
      isOpen.current = false
      setAnnouncement(null)
      return
    }

    let cancelled = false
    let isLoading = false
    let leftAt: number | null = null

    async function load(): Promise<void> {
      if (isLoading || isOpen.current || !canInterrupt()) {
        return
      }

      isLoading = true
      try {
        const res = await apiFetch('/api/announcements/current')
        if (!res.ok || cancelled) {
          return
        }

        const data = await res.json() as { announcement: Announcement | null }
        if (cancelled || data.announcement === null) {
          return
        }

        isOpen.current = true
        setAnnouncement(data.announcement)
      }
      catch {
        // Offline: no announcement, and above all no error screen for it.
      }
      finally {
        isLoading = false
      }
    }

    void load()

    const watch = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        leftAt = Date.now()
        return
      }

      if (state === 'active' && leftAt !== null) {
        const isNewOpening = Date.now() - leftAt >= NEW_OPENING_AFTER_MS
        leftAt = null
        if (isNewOpening) {
          void load()
        }
      }
    })

    return () => {
      cancelled = true
      watch.remove()
    }
  }, [userId, canInterrupt])

  const dismiss = useCallback(() => {
    isOpen.current = false
    setAnnouncement(null)
  }, [])

  const markSeen = useCallback((id: string) => {
    // Lost offline, and that is acceptable: it comes back at the next opening.
    apiFetch(`/api/announcements/${id}/seen`, { method: 'POST' }).catch(() => undefined)
  }, [])

  return { announcement, dismiss, markSeen }
}
