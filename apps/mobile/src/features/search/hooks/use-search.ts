import type { CategoryItem } from '../../../utils/category-icons'
import { useCallback, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'
import { FALLBACK_CATEGORIES, getCategoryFallbackIcon } from '../../../utils/category-icons'
import { OfflineCache } from '../../../utils/offline-storage'

interface SearchFilters {
  q?: string
  latitude: number
  longitude: number
  radius?: number
  category?: string
  maxPrice?: number
  inStockOnly?: boolean
  minRating?: number
  mode?: 'CONTACT' | 'ORDER'
  validatedOnly?: boolean
  sortBy?: 'distance' | 'rating' | 'price'
  page?: number
}

interface SearchResult {
  supplier: {
    id: string
    shopName: string
    distance: number
    rating: number | null
    reviewCount: number
    mode: 'CONTACT' | 'ORDER'
    badges: string[]
    isOpen: boolean
  }
  product: {
    id: string
    name: string
    photo: string | null
    pricePerUnit: number
    unit: string
    inStock: boolean
    promotionalPrice: number | null
  }
}

interface SearchResponse {
  results: SearchResult[]
  total: number
  hasMore: boolean
}

export type { SearchFilters, SearchResult }

export function useSearchProducts() {
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  const search = useCallback(async (filters: SearchFilters) => {
    setLoading(true)

    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value))
      }
    })

    if (filters.q) {
      OfflineCache.addSearchTerm(filters.q)
    }

    const cacheKey = `search:${params.toString()}`

    try {
      const cached = await OfflineCache.getCachedResults(cacheKey) as SearchResponse | null

      const res = await apiFetch(`/api/search/products?${params.toString()}`)

      if (res.ok) {
        const data: SearchResponse = await res.json()
        setResults(data.results)
        setTotal(data.total)
        setHasMore(data.hasMore)
        await OfflineCache.setCachedResults(cacheKey, data)
      }
      else if (cached) {
        setResults(cached.results)
        setTotal(cached.total)
        setHasMore(cached.hasMore)
      }
    }
    catch {
      const cached = await OfflineCache.getCachedResults(cacheKey) as SearchResponse | null
      if (cached) {
        setResults(cached.results)
        setTotal(cached.total)
        setHasMore(cached.hasMore)
      }
    }
    finally {
      setLoading(false)
    }
  }, [])

  return { results, loading, total, hasMore, search }
}

export function useAutocomplete() {
  const [suggestions, setSuggestions] = useState<
    Array<{ text: string, type: string, id?: string }>
  >([])

  const autocomplete = useCallback(
    async (q: string, latitude: number, longitude: number) => {
      if (q.length < 2) {
        setSuggestions([])
        return
      }
      try {
        const res = await apiFetch(
          `/api/search/autocomplete?q=${encodeURIComponent(q)}&latitude=${latitude}&longitude=${longitude}`,
        )
        if (res.ok) {
          const data = await res.json()
          setSuggestions(data.suggestions)
        }
      }
      catch {
        // Silent fail on autocomplete
      }
    },
    [],
  )

  return { suggestions, autocomplete }
}

export function useCategories() {
  const [categories, setCategories] = useState<CategoryItem[]>(FALLBACK_CATEGORIES)

  const loadCategories = useCallback(async () => {
    try {
      const res = await apiFetch('/api/search/categories')
      if (res.ok) {
        const data = await res.json()
        const mapped: CategoryItem[] = (data.categories ?? []).map(
          (cat: { id: string, name: string, slug: string, imageUrl: string | null }) => ({
            id: cat.id,
            label: cat.name,
            slug: cat.slug,
            imageUrl: cat.imageUrl,
            fallbackIcon: getCategoryFallbackIcon(cat.slug),
          }),
        )
        if (mapped.length > 0) {
          setCategories(mapped)
        }
      }
    }
    catch {
      // Keep fallback categories
    }
  }, [])

  return { categories, loadCategories }
}
