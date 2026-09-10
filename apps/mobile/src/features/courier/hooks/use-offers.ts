import type { DeliveryOffer } from '../types'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'

export interface AcceptResult {
  ok: boolean
  conflict: boolean
  gone: boolean
  forbidden: boolean
  /** Server explanation when the 403 is a wallet-debt block, null otherwise. */
  debtMessage: string | null
}

/** Wallet debt past the platform limit: the feed is withheld until a top-up. */
export interface DebtBlock {
  /** Wallet balance in FCFA, negative. */
  balance: number
  /** Maximum tolerated debt in FCFA, positive. */
  limit: number
  message: string
}

interface ForbiddenBody {
  code?: string
  message?: string
  balance?: number
  limit?: number
}

/** Reads a 403 body and returns the debt block it describes, null for a plain 403. */
async function readDebtBlock(res: Response): Promise<DebtBlock | null> {
  try {
    const body = await res.json() as ForbiddenBody
    if (body.code !== 'COURIER_DEBT') {
      return null
    }
    return {
      balance: typeof body.balance === 'number' ? body.balance : 0,
      limit: typeof body.limit === 'number' ? body.limit : 0,
      message: body.message ?? 'Votre portefeuille dépasse la dette autorisée. Rechargez-le pour reprendre les courses.',
    }
  }
  catch {
    return null
  }
}

/** Offer feed for available couriers: fetch, pull-to-refresh, accept with 409 handling. */
export function useOffers() {
  const [offers, setOffers] = useState<DeliveryOffer[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [debtBlock, setDebtBlock] = useState<DebtBlock | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/deliveries/offers')
      if (res.status === 403) {
        const block = await readDebtBlock(res)
        setDebtBlock(block)
        setUnavailable(block === null)
        setOffers([])
        return
      }
      if (!res.ok) {
        return
      }
      setUnavailable(false)
      setDebtBlock(null)
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
        return { ok: true, conflict: false, gone: false, forbidden: false, debtMessage: null }
      }
      const block = res.status === 403 ? await readDebtBlock(res) : null
      return {
        ok: false,
        conflict: res.status === 409,
        gone: res.status === 410,
        forbidden: res.status === 403,
        debtMessage: block?.message ?? null,
      }
    }
    catch {
      return { ok: false, conflict: false, gone: false, forbidden: false, debtMessage: null }
    }
    finally {
      await load()
    }
  }, [load])

  return { offers, loading, refreshing, unavailable, debtBlock, refresh, accept }
}
