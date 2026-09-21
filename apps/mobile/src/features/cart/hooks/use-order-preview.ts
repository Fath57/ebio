import { useEffect, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'

export type PreviewPromotionType = 'PRICE' | 'BOGO' | 'FREE_DELIVERY'

export type PreviewDeliveryReason
  = | 'PICKUP'
    | 'FREE_THRESHOLD'
    | 'FLAT'
    | 'DISTANCE'
    | 'ZONE'
    | 'NO_POSITION'
    | 'NO_SHOP_POSITION'
    | 'OUT_OF_RANGE'
    | 'FREE_PROMO'

export interface OrderPreviewLine {
  productId: string
  variantId: string | null
  name: string
  quantity: number
  unitPrice: number
  regularPrice: number
  totalPrice: number
  /** Free unit added by a buy-X-get-Y promotion; never sent back to the API. */
  isGift: boolean
  promotionType: PreviewPromotionType | null
}

export interface OrderPreview {
  lines: OrderPreviewLine[]
  itemsTotal: number
  discount: number
  /** Why a promo code was refused (discount is then 0). */
  promoCodeMessage: string | null
  deliveryFee: number
  sponsoredDeliveryFee: number
  deliverySponsor: 'SUPPLIER' | 'PLATFORM' | null
  deliveryReason: PreviewDeliveryReason
  deliveryDistanceKm: number | null
  /**
   * Number of runs this cart yields. Past one, the fee shown is the
   * sum of several deliveries: the buyer must know they will be
   * delivered more than once, without having to understand why the split
   * falls where it does.
   */
  deliveryRunCount: number
  total: number
}

export interface OrderPreviewInput {
  pickupMode: 'DELIVERY' | 'ON_SITE'
  position: { latitude: number, longitude: number } | null
  promoCode: string | null
  items: Array<{ productId: string, variantId?: string, quantity: number }>
}

export interface OrderPreviewState {
  preview: OrderPreview | null
  loading: boolean
  /** Server message when the basket cannot be priced (400) or the call failed. */
  error: string | null
}

// Inputs change on every map drag and keystroke: a short debounce keeps the
// API from being hit for intermediate values.
const DEBOUNCE_MS = 300

const DELIVERY_REASONS: PreviewDeliveryReason[] = [
  'PICKUP',
  'FREE_THRESHOLD',
  'FLAT',
  'DISTANCE',
  'ZONE',
  'NO_POSITION',
  'NO_SHOP_POSITION',
  'OUT_OF_RANGE',
  'FREE_PROMO',
]

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback
}

function parseLine(data: Record<string, unknown>): OrderPreviewLine {
  const promotionType = data.promotionType
  return {
    productId: String(data.productId ?? ''),
    variantId: typeof data.variantId === 'string' ? data.variantId : null,
    name: typeof data.name === 'string' ? data.name : '',
    quantity: readNumber(data.quantity),
    unitPrice: readNumber(data.unitPrice),
    regularPrice: readNumber(data.regularPrice),
    totalPrice: readNumber(data.totalPrice),
    isGift: data.isGift === true,
    promotionType: promotionType === 'PRICE' || promotionType === 'BOGO' || promotionType === 'FREE_DELIVERY'
      ? promotionType
      : null,
  }
}

function parsePreview(data: Record<string, unknown>): OrderPreview {
  const reason = data.deliveryReason
  const sponsor = data.deliverySponsor
  return {
    lines: Array.isArray(data.lines)
      ? (data.lines as Array<Record<string, unknown>>).map(parseLine)
      : [],
    itemsTotal: readNumber(data.itemsTotal),
    discount: readNumber(data.discount),
    promoCodeMessage: typeof data.promoCodeMessage === 'string' ? data.promoCodeMessage : null,
    deliveryFee: readNumber(data.deliveryFee),
    sponsoredDeliveryFee: readNumber(data.sponsoredDeliveryFee),
    deliverySponsor: sponsor === 'SUPPLIER' || sponsor === 'PLATFORM' ? sponsor : null,
    deliveryReason: typeof reason === 'string' && (DELIVERY_REASONS as string[]).includes(reason)
      ? reason as PreviewDeliveryReason
      : 'NO_POSITION',
    deliveryDistanceKm: typeof data.deliveryDistanceKm === 'number' ? data.deliveryDistanceKm : null,
    deliveryRunCount: Array.isArray(data.runs) ? data.runs.length : 1,
    total: readNumber(data.total),
  }
}

/**
 * Basket as the API would charge it: promotions, gifts, promo code and
 * delivery fee, computed server-side so the summary never invents an amount.
 *
 * Pass `null` to idle (no call, no state). The server recomputes everything at
 * order creation and stays the authority — this mirrors it for display.
 */
export function useOrderPreview(input: OrderPreviewInput | null): OrderPreviewState {
  const [preview, setPreview] = useState<OrderPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Serialised so the effect re-runs on content changes only, not on a fresh
  // object built each render by the caller.
  const inputKey = input === null ? null : JSON.stringify(input)

  useEffect(() => {
    if (inputKey === null) {
      setPreview(null)
      setLoading(false)
      setError(null)
      return
    }
    const body = JSON.parse(inputKey) as OrderPreviewInput
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        // The whole cart, every shop together: the server splits it
        // and announces a single delivery fee.
        const res = await apiFetch('/api/orders/checkout/preview', {
          method: 'POST',
          body: JSON.stringify({
            pickupMode: body.pickupMode,
            ...(body.position ? { deliveryLatitude: body.position.latitude, deliveryLongitude: body.position.longitude } : {}),
            ...(body.promoCode ? { promoCode: body.promoCode } : {}),
            items: body.items,
          }),
        })
        if (cancelled) {
          return
        }
        if (!res.ok) {
          const payload = await res.json().catch(() => null) as { message?: unknown, aggregateErrors?: Array<{ message?: unknown }> } | null
          const message = payload?.aggregateErrors?.[0]?.message ?? payload?.message
          if (!cancelled) {
            setPreview(null)
            setError(typeof message === 'string' ? message : 'Impossible de calculer le montant de la commande.')
          }
          return
        }
        const data = await res.json() as Record<string, unknown>
        if (!cancelled) {
          setPreview(parsePreview(data))
          setError(null)
        }
      }
      catch {
        if (!cancelled) {
          setPreview(null)
          setError('Impossible de calculer le montant de la commande.')
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
  }, [inputKey])

  return { preview, loading, error }
}
