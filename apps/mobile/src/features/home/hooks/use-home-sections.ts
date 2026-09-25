import type { SearchResult } from '../../search/hooks/use-search'
import { useEffect, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'

/** A section's criteria, as the back-office defined them. */
export interface HomeSectionCriteria {
  categorySlug?: string
  supplierId?: string
  validatedOnly?: boolean
  promoOnly?: boolean
  minRating?: number
  maxPrice?: number
  newerThanDays?: number
  maxDistanceKm?: number
  sortBy?: 'distance' | 'rating' | 'price'
}

export interface HomeSection {
  id: string
  title: string
  subtitle: string | null
  icon: string | null
  /** Null for a hand-picked section: the rail already shows everything. */
  criteria: HomeSectionCriteria | null
  results: SearchResult[]
}

/**
 * The home sections, in the order the back-office arranged them.
 *
 * They used to be hard-coded here — "Près de vous", "Validé eBio", "En
 * promotion" — and each fired its own search. Three round trips for three
 * frozen rails; now it is one, and rails can be renamed, reordered and added
 * without touching the app.
 *
 * The server already drops empty sections: a title followed by an empty rail
 * reads as a broken app.
 */
export function useHomeSections(latitude: number, longitude: number): { sections: HomeSection[], loading: boolean } {
  const [sections, setSections] = useState<HomeSection[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      try {
        const query = new URLSearchParams({
          latitude: String(latitude),
          longitude: String(longitude),
        }).toString()
        const res = await apiFetch(`/api/home/sections?${query}`)
        if (res.ok && !cancelled) {
          const data = await res.json() as { sections?: HomeSection[] }
          setSections(data.sections ?? [])
        }
      }
      catch {
        // Offline: the home screen keeps what it had rather than emptying.
      }
      finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [latitude, longitude])

  return { sections, loading }
}
