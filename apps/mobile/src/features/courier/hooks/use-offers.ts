import type { CourierOffer, DeliveryOffer, RunOffer } from '../types'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'

export interface AcceptResult {
  ok: boolean
  conflict: boolean
  gone: boolean
  forbidden: boolean
  /** Server explanation when the 403 is a wallet-debt block, null otherwise. */
  debtMessage: string | null
  /** Server `message` of a 409 (e.g. run held by another courier), null otherwise. */
  message: string | null
}

export interface DeclineResult {
  ok: boolean
  /** Server explanation when the offer is no longer ours (409), null otherwise. */
  message: string | null
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

/** Reads the `message` of an error body, null when absent or unparsable. */
async function readMessage(res: Response): Promise<string | null> {
  try {
    const body = await res.json() as { message?: unknown }
    return typeof body.message === 'string' && body.message.length > 0 ? body.message : null
  }
  catch {
    return null
  }
}

/** Earliest exclusive-window end among targeted offers, in ms since epoch; null when none. */
function earliestExpiry(offers: CourierOffer[]): number | null {
  let earliest: number | null = null
  for (const offer of offers) {
    if (!offer.isTargeted || !offer.expiresAt) {
      continue
    }
    const at = new Date(offer.expiresAt).getTime()
    if (Number.isNaN(at)) {
      continue
    }
    if (earliest === null || at < earliest) {
      earliest = at
    }
  }
  return earliest
}

/**
 * File unique des propositions : une course isolée et une tournée y tiennent
 * la même place. Le livreur n'a pas à savoir laquelle des deux lui est
 * proposée pour décider — il regarde ce qu'il gagne et où il va.
 *
 * Les offres prioritaires passent devant, puis la plus proche.
 */
function mergeOffers(deliveries: DeliveryOffer[], runs: RunOffer[]): CourierOffer[] {
  const merged: CourierOffer[] = [
    ...deliveries.map(offer => ({ kind: 'DELIVERY' as const, ...offer })),
    ...runs.map(offer => ({ kind: 'RUN' as const, ...offer })),
  ]
  return merged.sort((a, b) => {
    if (a.isTargeted !== b.isTargeted) {
      return a.isTargeted ? -1 : 1
    }
    const da = a.distanceKm ?? Number.POSITIVE_INFINITY
    const db = b.distanceKm ?? Number.POSITIVE_INFINITY
    if (da !== db) {
      return da - db
    }
    return new Date(a.offeredAt).getTime() - new Date(b.offeredAt).getTime()
  })
}

/** Offer feed for available couriers: fetch, pull-to-refresh, accept/decline with 409 handling. */
export function useOffers() {
  const [offers, setOffers] = useState<CourierOffer[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [debtBlock, setDebtBlock] = useState<DebtBlock | null>(null)

  const load = useCallback(async () => {
    try {
      // Les deux files sont lues ensemble : les mêmes règles d'indisponibilité
      // et de dette s'appliquent aux deux, et l'écran n'en montre qu'une.
      const [deliveryRes, runRes] = await Promise.all([
        apiFetch('/api/deliveries/offers'),
        apiFetch('/api/runs/offers'),
      ])
      if (deliveryRes.status === 403) {
        const block = await readDebtBlock(deliveryRes)
        setDebtBlock(block)
        setUnavailable(block === null)
        setOffers([])
        return
      }
      if (!deliveryRes.ok) {
        return
      }
      setUnavailable(false)
      setDebtBlock(null)
      const deliveries = await deliveryRes.json() as DeliveryOffer[]
      // Une file de tournées indisponible ne doit pas vider l'écran : les
      // courses isolées restent prenables.
      const runs = runRes.ok ? await runRes.json() as RunOffer[] : []
      setOffers(mergeOffers(deliveries, runs))
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

  // Targeted offers vanish server-side once their window closes: refetch right after
  // the earliest one expires so the card does not linger as "Expirée".
  useEffect(() => {
    const expiry = earliestExpiry(offers)
    if (expiry === null) {
      return
    }
    const delay = Math.max(0, expiry - Date.now() + 500)
    const timer = setTimeout(() => {
      load()
    }, delay)
    return () => {
      clearTimeout(timer)
    }
  }, [offers, load])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const accept = useCallback(async (offer: CourierOffer): Promise<AcceptResult> => {
    const base = offer.kind === 'RUN' ? '/api/runs' : '/api/deliveries'
    try {
      const res = await apiFetch(`${base}/${offer.id}/accept`, { method: 'POST' })
      if (res.ok) {
        return { ok: true, conflict: false, gone: false, forbidden: false, debtMessage: null, message: null }
      }
      const block = res.status === 403 ? await readDebtBlock(res) : null
      const message = res.status === 409 ? await readMessage(res) : null
      return {
        ok: false,
        conflict: res.status === 409,
        gone: res.status === 410,
        forbidden: res.status === 403,
        debtMessage: block?.message ?? null,
        message,
      }
    }
    catch {
      return { ok: false, conflict: false, gone: false, forbidden: false, debtMessage: null, message: null }
    }
    finally {
      await load()
    }
  }, [load])

  const decline = useCallback(async (offer: CourierOffer): Promise<DeclineResult> => {
    const base = offer.kind === 'RUN' ? '/api/runs' : '/api/deliveries'
    try {
      const res = await apiFetch(`${base}/${offer.id}/decline`, { method: 'POST' })
      if (res.ok) {
        return { ok: true, message: null }
      }
      return { ok: false, message: await readMessage(res) }
    }
    catch {
      return { ok: false, message: null }
    }
    finally {
      await load()
    }
  }, [load])

  return { offers, loading, refreshing, unavailable, debtBlock, refresh, accept, decline }
}
