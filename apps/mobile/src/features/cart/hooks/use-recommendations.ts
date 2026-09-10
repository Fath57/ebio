import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'

export type RecommendationReason = 'BOUGHT_TOGETHER' | 'PROMO' | 'POPULAR' | 'NEW'

export interface RecommendedProduct {
  id: string
  name: string
  photo: string | null
  thumbnail: string | null
  pricePerUnit: number
  unit: string
  stock: number
  promotionalPrice: number | null
  promotionTypes: string[]
  categoryName: string | null
  reason: RecommendationReason
}

export interface RecommendationsState {
  items: RecommendedProduct[]
  loading: boolean
}

function isReason(value: unknown): value is RecommendationReason {
  return value === 'BOUGHT_TOGETHER' || value === 'PROMO' || value === 'POPULAR' || value === 'NEW'
}

function parseItem(raw: Record<string, unknown>): RecommendedProduct | null {
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string' || !isReason(raw.reason)) {
    return null
  }
  return {
    id: raw.id,
    name: raw.name,
    photo: typeof raw.photo === 'string' ? raw.photo : null,
    thumbnail: typeof raw.thumbnail === 'string' ? raw.thumbnail : null,
    pricePerUnit: typeof raw.pricePerUnit === 'number' ? raw.pricePerUnit : 0,
    unit: typeof raw.unit === 'string' ? raw.unit : '',
    stock: typeof raw.stock === 'number' ? raw.stock : 0,
    promotionalPrice: typeof raw.promotionalPrice === 'number' ? raw.promotionalPrice : null,
    promotionTypes: Array.isArray(raw.promotionTypes) ? raw.promotionTypes.filter((t): t is string => typeof t === 'string') : [],
    categoryName: typeof raw.categoryName === 'string' ? raw.categoryName : null,
    reason: raw.reason,
  }
}

/**
 * Products of the same shop worth adding next to the given ones. One request
 * per distinct (shop, basket) key, cached for the life of the component; a
 * failed call simply yields no suggestions.
 */
export function useRecommendations(
  supplierId: string | null,
  productIds: string[],
  limit = 4,
): RecommendationsState {
  const [items, setItems] = useState<RecommendedProduct[]>([])
  const [loading, setLoading] = useState(false)
  const cacheRef = useRef(new Map<string, RecommendedProduct[]>())
  const key = supplierId ? `${supplierId}|${[...productIds].sort().join(',')}|${limit}` : null

  useEffect(() => {
    if (key === null) {
      setItems([])
      setLoading(false)
      return
    }
    const cached = cacheRef.current.get(key)
    if (cached) {
      setItems(cached)
      setLoading(false)
      return
    }
    const [shop, ids, max] = key.split('|')
    let cancelled = false
    setLoading(true)
    async function load() {
      try {
        const params = new URLSearchParams({ supplierId: shop, productIds: ids, limit: max })
        const res = await apiFetch(`/api/recommendations?${params.toString()}`)
        if (!res.ok || cancelled) {
          return
        }
        const data = await res.json() as { items?: unknown }
        const parsed = Array.isArray(data.items)
          ? (data.items as Array<Record<string, unknown>>).map(parseItem).filter((item): item is RecommendedProduct => item !== null)
          : []
        cacheRef.current.set(key as string, parsed)
        if (!cancelled) {
          setItems(parsed)
        }
      }
      catch {
        // Suggestions are a nicety: nothing to show is the whole fallback.
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
  }, [key])

  return { items, loading }
}
