import type { Delivery } from '../types'
import type { CourierWalletTransaction } from './use-courier-wallet'
import { useEffect, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'

/**
 * The earning of a collection run, as the API words it: « Gain de la course,
 * commande #… apportée au point eBio ». The ledger carries no purpose, the
 * description is the only mark.
 */
const COLLECTION_EARNING = /apportée au point eBio/i

/** True for the courier's earning on a « La Valise du pays » collection. */
export function isCollectionEarning(movement: CourierWalletTransaction): boolean {
  return movement.type === 'DELIVERY_EARNING' && movement.deliveryId !== null && COLLECTION_EARNING.test(movement.description)
}

/** Shop names already resolved, kept across screens: a delivery never changes shop. */
const shopByDelivery = new Map<string, string>()
/** Lookups in flight, so one row never fires twice at once. */
const requested = new Set<string>()

async function fetchShopName(deliveryId: string): Promise<string | null> {
  try {
    const res = await apiFetch(`/api/deliveries/${deliveryId}`)
    if (!res.ok) {
      return null
    }
    const delivery = await res.json() as Pick<Delivery, 'supplierShopName'>
    return delivery.supplierShopName ?? null
  }
  catch {
    return null
  }
}

/**
 * Resolves the shop of each collection earning in the ledger, so the line
 * reads « Collecte eBio, <boutique> ». Only collection rows are looked up,
 * once each; the others never cost a request.
 */
export function useCollectionShops(movements: CourierWalletTransaction[]): Record<string, string> {
  const [shops, setShops] = useState<Record<string, string>>(() => Object.fromEntries(shopByDelivery))

  useEffect(() => {
    const missing = movements
      .filter(isCollectionEarning)
      .map(movement => movement.deliveryId as string)
      .filter(id => !shopByDelivery.has(id) && !requested.has(id))
    if (missing.length === 0) {
      return
    }
    for (const id of missing) {
      requested.add(id)
    }
    // No cancellation: the names land in the shared cache either way, and a
    // late state update on an unmounted screen is a no-op.
    Promise.all(missing.map(async id => [id, await fetchShopName(id)] as const)).then((found) => {
      for (const [id, shop] of found) {
        if (shop) {
          shopByDelivery.set(id, shop)
        }
        else {
          // Offline or refused: the next ledger refresh may try again.
          requested.delete(id)
        }
      }
      setShops(Object.fromEntries(shopByDelivery))
    })
  }, [movements])

  return shops
}
