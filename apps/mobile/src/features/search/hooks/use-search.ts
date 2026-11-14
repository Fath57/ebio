import type { CategoryItem } from '../../../utils/category-icons'
import { useCallback, useRef, useState } from 'react'
import { track } from '../../../utils/analytics'
import { apiFetch } from '../../../utils/api-client'
import { FALLBACK_CATEGORIES, getCategoryFallbackIcon } from '../../../utils/category-icons'
import { OfflineCache } from '../../../utils/offline-storage'

interface SearchFilters {
  q?: string
  /** Absent for the whole catalogue (`scope: 'all'`). */
  latitude?: number
  longitude?: number
  radius?: number
  /**
   * `all` in « mode Valise »: the shops are in Benin and the buyer abroad, so
   * the catalogue is read whole, distance aside.
   */
  scope?: 'nearby' | 'all'
  category?: string
  maxPrice?: number
  inStockOnly?: boolean
  minRating?: number
  mode?: 'CONTACT' | 'ORDER'
  validatedOnly?: boolean
  promoOnly?: boolean
  /** One specific shop, when a home section is dedicated to it. */
  supplierId?: string
  /** Listed less than N days ago, what "nouveau" actually means. */
  newerThanDays?: number
  /** Exactly these products, for a hand-picked home section. */
  productIds?: string[]
  sortBy?: 'distance' | 'rating' | 'price'
  page?: number
}

interface SearchResult {
  supplier: {
    id: string
    shopName: string
    /** Coordonnées du point de vente, `null` si le fournisseur n'est pas localisé. */
    latitude: number | null
    longitude: number | null
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
    thumbnail: string | null
    pricePerUnit: number
    unit: string
    inStock: boolean
    promotionalPrice: number | null
    /** The product's own rating, null below three reviews; not every endpoint sends it. */
    ratingAvg?: number | null
    ratingCount?: number
    /** Live promotion types; not every endpoint sends them. */
    promotionTypes?: string[]
  }
}

interface SearchResponse {
  results: SearchResult[]
  total: number
  hasMore: boolean
  /** A spelling that finds products, when the query as typed found none. */
  didYouMean?: string | null
}

export type { SearchFilters, SearchResult }

const PAGE_SIZE = 20

export function useSearchProducts() {
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  /** The first page could not be loaded and no cached copy exists. */
  const [hasError, setHasError] = useState(false)
  const [didYouMean, setDidYouMean] = useState<string | null>(null)
  // Filtres + page courants, mémorisés pour que loadMore réutilise la même requête.
  const filtersRef = useRef<SearchFilters | null>(null)
  const pageRef = useRef(1)
  // Only the latest search may write the results: a slow answer to an earlier
  // query (a category tapped then another) must not overwrite a newer one.
  const requestIdRef = useRef(0)

  const fetchPage = useCallback(async (filters: SearchFilters, page: number, append: boolean) => {
    const requestId = requestIdRef.current
    const isCurrent = () => requestId === requestIdRef.current
    const params = new URLSearchParams()
    Object.entries({ ...filters, page, limit: PAGE_SIZE }).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return
      }
      // An array stringifies to "a,b,c" on its own, which is what the API
      // reads back. Spelling it out so it stays deliberate rather than a
      // lucky default of String().
      params.append(key, Array.isArray(value) ? value.join(',') : String(value))
    })

    if (page === 1 && filters.q) {
      OfflineCache.addSearchTerm(filters.q)
    }

    const cacheKey = `search:${params.toString()}`

    /**
     * Without a cached copy, the list is emptied and the error shown: keeping
     * the previous query's results made « mangue » display tomatoes.
     */
    async function fallbackToCache() {
      const cached = await OfflineCache.getCachedResults(cacheKey) as SearchResponse | null
      if (!isCurrent()) {
        return
      }
      setResults(cached?.results ?? [])
      setTotal(cached?.total ?? 0)
      setHasMore(cached?.hasMore ?? false)
      setDidYouMean(cached?.didYouMean ?? null)
      setHasError(!cached)
    }

    try {
      const res = await apiFetch(`/api/search/products?${params.toString()}`)
      if (res.ok) {
        const data: SearchResponse = await res.json()
        if (!isCurrent()) {
          return
        }
        if (page === 1 && filters.q) {
          // A search that returns nothing is the catalogue's shopping list,
          // the one measurement here that names something to go and fix.
          track('recherche', { terme: filters.q, resultats: data.total })
        }
        setResults(prev => (append ? [...prev, ...data.results] : data.results))
        setTotal(data.total)
        setHasMore(data.hasMore)
        setHasError(false)
        if (!append) {
          setDidYouMean(data.didYouMean ?? null)
        }
        if (!append) {
          await OfflineCache.setCachedResults(cacheKey, data)
        }
      }
      else if (!append) {
        await fallbackToCache()
      }
    }
    catch {
      if (!append) {
        await fallbackToCache()
      }
    }
  }, [])

  const search = useCallback(async (filters: SearchFilters) => {
    requestIdRef.current += 1
    const requestId = requestIdRef.current
    filtersRef.current = filters
    pageRef.current = 1
    setLoading(true)
    await fetchPage(filters, 1, false)
    if (requestId === requestIdRef.current) {
      setLoading(false)
    }
  }, [fetchPage])

  const loadMore = useCallback(async () => {
    if (!hasMore || loading || loadingMore || !filtersRef.current) {
      return
    }
    const nextPage = pageRef.current + 1
    setLoadingMore(true)
    await fetchPage(filtersRef.current, nextPage, true)
    pageRef.current = nextPage
    setLoadingMore(false)
  }, [hasMore, loading, loadingMore, fetchPage])

  return { results, loading, loadingMore, total, hasMore, hasError, didYouMean, search, loadMore }
}

/** Waiting this long after the last keystroke spares one request per letter. */
const AUTOCOMPLETE_DELAY_MS = 250

export interface Suggestion {
  text: string
  type: 'product' | 'category' | 'supplier'
  id?: string
}

export function useAutocomplete() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // A slow answer for « to » must not replace the one for « tomate ».
  const requestIdRef = useRef(0)

  const autocomplete = useCallback(
    (q: string, latitude: number, longitude: number, wholeCatalogue = false) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      requestIdRef.current += 1
      const requestId = requestIdRef.current
      if (q.length < 2) {
        setSuggestions([])
        return
      }
      timerRef.current = setTimeout(async () => {
        try {
          // The whole catalogue sends no position at all (« mode Valise »).
          const where = wholeCatalogue ? 'scope=all' : `latitude=${latitude}&longitude=${longitude}`
          const res = await apiFetch(`/api/search/autocomplete?q=${encodeURIComponent(q)}&${where}`)
          if (res.ok && requestId === requestIdRef.current) {
            const data = await res.json() as { suggestions: Suggestion[] }
            setSuggestions(data.suggestions)
          }
        }
        catch {
          // Silent fail on autocomplete
        }
      }, AUTOCOMPLETE_DELAY_MS)
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
