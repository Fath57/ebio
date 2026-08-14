import { useEffect, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'

interface DeliveryPricing {
  deliveryFee: number
  freeDeliveryFrom: number | null
}

/**
 * Fee the shop charges for a delivery, so the buyer sees it before paying.
 *
 * The server recomputes it when the order is created and stays the authority —
 * this only mirrors the rule for display. Both must agree: a total that changes
 * at payment time is how trust is lost.
 */
export function useDeliveryFee(supplierId: string, isDelivery: boolean, itemsTotal: number) {
  const [pricing, setPricing] = useState<DeliveryPricing | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const res = await apiFetch(`/api/suppliers/${supplierId}`)
        if (!res.ok || cancelled) {
          return
        }
        const data = await res.json() as Record<string, unknown>
        setPricing({
          deliveryFee: typeof data.deliveryFee === 'number' ? data.deliveryFee : 0,
          freeDeliveryFrom: typeof data.freeDeliveryFrom === 'number' ? data.freeDeliveryFrom : null,
        })
      }
      catch {
        // Left null: the summary falls back to showing no delivery line rather
        // than inventing a fee.
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [supplierId])

  if (!isDelivery || !pricing || pricing.deliveryFee <= 0) {
    return { deliveryFee: 0, freeDeliveryFrom: pricing?.freeDeliveryFrom ?? null }
  }

  // The waiver is tested on the items alone, so a large fee cannot unlock itself.
  const waived = pricing.freeDeliveryFrom !== null && itemsTotal >= pricing.freeDeliveryFrom
  return {
    deliveryFee: waived ? 0 : pricing.deliveryFee,
    freeDeliveryFrom: pricing.freeDeliveryFrom,
  }
}
