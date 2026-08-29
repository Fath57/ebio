import type { DeliveryOffer } from '../types'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'

export interface AcceptResult {
  ok: boolean
  conflict: boolean
  gone: boolean
  forbidden: boolean
}

/** Offer feed for available couriers: fetch, pull-to-refresh, accept with 409 handling. */
export function useOffers() {
  const [offers, setOffers] = useState<DeliveryOffer[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/deliveries/offers')
      if (res.status === 403) {
        setUnavailable(true)
        setOffers([])
        return
      }
      if (!res.ok) {
        return
      }
      setUnavailable(false)
      setOffers(await res.json() as DeliveryOffer[])
    }
    catch {
      // Keep the last list on network errors; pull-to-refresh retries.
    }
    finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const accept = useCallback(async (offerId: string): Promise<AcceptResult> => {
    try {
      const res = await apiFetch(`/api/deliveries/${offerId}/accept`, { method: 'POST' })
      if (res.ok) {
        return { ok: true, conflict: false, gone: false, forbidden: false }
      }
      return {
        ok: false,
        conflict: res.status === 409,
        gone: res.status === 410,
        forbidden: res.status === 403,
      }
    }
    catch {
      return { ok: false, conflict: false, gone: false, forbidden: false }
    }
    finally {
      await load()
    }
  }, [load])

  return { offers, loading, refreshing, unavailable, refresh, accept }
}
