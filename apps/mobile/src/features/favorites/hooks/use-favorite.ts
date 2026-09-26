import { useCallback, useEffect, useState } from 'react'
import { dropProduct, fetchKeptIds, keepProduct } from '../favorites'

interface FavoriteState {
  isFavorite: boolean
  /** True until the server has said which way the heart goes. */
  isLoading: boolean
  toggle: () => void
}

/**
 * Whether this product is kept, and the one gesture that changes it.
 *
 * The heart flips at once and is put back if the server refuses: a favourite
 * is a small, reversible thing, and waiting a round trip to fill a heart is
 * the kind of delay that reads as a broken button. What it never does again is
 * flip without telling anyone — it used to be a `useState(false)`, so it
 * forgot everything the moment one left the screen.
 */
export function useFavorite(productId: string | null): FavoriteState {
  const [isFavorite, setIsFavorite] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!productId) {
      setIsLoading(false)
      return
    }
    let cancelled = false
    async function load(): Promise<void> {
      const kept = await fetchKeptIds([productId as string])
      if (!cancelled) {
        setIsFavorite(kept.length > 0)
        setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [productId])

  const toggle = useCallback(() => {
    if (!productId) {
      return
    }
    const wanted = !isFavorite
    setIsFavorite(wanted)
    const send = wanted ? keepProduct : dropProduct
    send(productId).catch(() => {
      // Put back what the server did not accept, rather than leave a heart
      // claiming something untrue.
      setIsFavorite(!wanted)
    })
  }, [isFavorite, productId])

  return { isFavorite, isLoading, toggle }
}
