import type { SearchResult } from '../../search/hooks/use-search'
import { useEffect, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'

interface HomeFeed {
  nearby: SearchResult[]
  validated: SearchResult[]
  promos: SearchResult[]
  loading: boolean
}

async function fetchProducts(params: Record<string, string>): Promise<SearchResult[]> {
  const qs = new URLSearchParams(params).toString()
  try {
    const res = await apiFetch(`/api/search/products?${qs}`)
    if (res.ok) {
      const data = await res.json()
      return (data.results ?? []) as SearchResult[]
    }
  }
  catch {
    // Silent fail — sections simply render empty
  }
  return []
}

/**
 * Compose le feed d'accueil à partir de l'endpoint de recherche existant
 * (aucun endpoint dédié requis) : proximité, fournisseurs validés, et
 * promotions dérivées côté client des résultats proches.
 */
export function useHomeFeed(latitude: number, longitude: number): HomeFeed {
  const [nearby, setNearby] = useState<SearchResult[]>([])
  const [validated, setValidated] = useState<SearchResult[]>([])
  const [promos, setPromos] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const base = {
      latitude: String(latitude),
      longitude: String(longitude),
      inStockOnly: 'true',
    }

    async function load() {
      const [near, valid, promo] = await Promise.all([
        fetchProducts({ ...base, sortBy: 'distance' }),
        fetchProducts({ ...base, validatedOnly: 'true', sortBy: 'rating' }),
        fetchProducts({ ...base, promoOnly: 'true', sortBy: 'distance' }),
      ])
      if (cancelled)
        return
      setNearby(near)
      setValidated(valid)
      setPromos(promo)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [latitude, longitude])

  return { nearby, validated, promos, loading }
}
