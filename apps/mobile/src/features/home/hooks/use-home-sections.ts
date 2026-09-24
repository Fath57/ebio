import type { SearchResult } from '../../search/hooks/use-search'
import { useEffect, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'

/** Les critères d'une section, tels que le back-office les a définis. */
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
  /** Nul pour une section composée à la main : le rail montre déjà tout. */
  criteria: HomeSectionCriteria | null
  results: SearchResult[]
}

/**
 * Les sections de l'accueil, telles que le back-office les a rangées.
 *
 * Elles étaient écrites en dur ici — « Près de vous », « Validé eBio », « En
 * promotion » — et chacune tirait sa propre recherche. Trois allers-retours
 * pour trois rails figés ; c'en est un seul, et les rails se renomment, se
 * réordonnent et s'ajoutent sans toucher à l'application.
 *
 * Le serveur écarte déjà les sections vides : un titre suivi d'un rail vide
 * donne l'impression d'une application cassée.
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
        // Hors ligne : l'accueil garde ce qu'il avait plutôt que de se vider.
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
