import { useEffect, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'

export type DeliveryQuoteReason
  = | 'PICKUP'
    | 'FREE_THRESHOLD'
    | 'FLAT'
    | 'DISTANCE'
    | 'ZONE'
    | 'NO_POSITION'
    | 'NO_SHOP_POSITION'
    | 'OUT_OF_RANGE'

export interface DeliveryQuote {
  mode: 'FLAT' | 'DISTANCE' | 'ZONES' | null
  /** Null when the buyer must pick a drop-off point or is too far away. */
  fee: number | null
  distanceKm: number | null
  reason: DeliveryQuoteReason
  requiresPosition: boolean
  maxDistanceKm: number | null
  freeFrom: number | null
}

export interface DeliveryPosition {
  latitude: number
  longitude: number
}

const PICKUP_QUOTE: DeliveryQuote = {
  mode: null,
  fee: 0,
  distanceKm: null,
  reason: 'PICKUP',
  requiresPosition: false,
  maxDistanceKm: null,
  freeFrom: null,
}

// Inputs change on every map drag and keystroke: a short debounce keeps the
// API from being hit for intermediate values.
const DEBOUNCE_MS = 300

function parseQuote(data: Record<string, unknown>): DeliveryQuote {
  return {
    mode: data.mode === 'FLAT' || data.mode === 'DISTANCE' || data.mode === 'ZONES' ? data.mode : null,
    fee: typeof data.fee === 'number' ? data.fee : null,
    distanceKm: typeof data.distanceKm === 'number' ? data.distanceKm : null,
    reason: typeof data.reason === 'string' ? data.reason as DeliveryQuoteReason : 'NO_POSITION',
    requiresPosition: data.requiresPosition === true,
    maxDistanceKm: typeof data.maxDistanceKm === 'number' ? data.maxDistanceKm : null,
    freeFrom: typeof data.freeFrom === 'number' ? data.freeFrom : null,
  }
}

/**
 * Platform-wide delivery fee for the cart, quoted by the API so the buyer sees
 * it before paying.
 *
 * The server recomputes it when the order is created and stays the authority —
 * this only mirrors the rule for display. Pickup never calls the API: the fee
 * is zero by definition.
 */
export function useDeliveryQuote(
  supplierId: string,
  isDelivery: boolean,
  itemsTotal: number,
  position: DeliveryPosition | null,
): { quote: DeliveryQuote | null, loading: boolean } {
  const [quote, setQuote] = useState<DeliveryQuote | null>(null)
  const [loading, setLoading] = useState(false)
  const latitude = position?.latitude ?? null
  const longitude = position?.longitude ?? null

  useEffect(() => {
    if (!isDelivery) {
      setQuote(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch('/api/delivery-pricing/quote', {
          method: 'POST',
          body: JSON.stringify({
            supplierId,
            itemsTotal,
            ...(latitude !== null && longitude !== null ? { latitude, longitude } : {}),
          }),
        })
        if (cancelled) {
          return
        }
        if (!res.ok) {
          // Left null: the summary shows no amount rather than inventing one,
          // and the server still rejects an order it cannot price.
          setQuote(null)
          return
        }
        const data = await res.json() as Record<string, unknown>
        if (!cancelled) {
          setQuote(parseQuote(data))
        }
      }
      catch {
        if (!cancelled) {
          setQuote(null)
        }
      }
      finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [supplierId, isDelivery, itemsTotal, latitude, longitude])

  if (!isDelivery) {
    return { quote: PICKUP_QUOTE, loading: false }
  }
  return { quote, loading }
}
