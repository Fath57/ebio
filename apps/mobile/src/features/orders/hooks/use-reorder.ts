import type { AddItemInput } from '../../cart/cart-context'
import { useCallback, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'
import { useCart } from '../../cart/cart-context'

/** What an order line carries, of what a cart line needs. */
interface OrderLine {
  productId: string
  quantity: number
  isGift?: boolean
}

interface FreshProduct {
  supplier: { id: string, shopName: string }
  product: {
    id: string
    name: string
    thumbnail: string | null
    photo: string | null
    pricePerUnit: number
    promotionalPrice: number | null
    unit: string
    inStock: boolean
    promotionTypes: string[]
  }
}

export interface ReorderOutcome {
  /** How many lines went back into the basket. */
  added: number
  /** Names of what could not: gone from the catalogue, or out of stock. */
  missing: string[]
}

interface ReorderState {
  isPending: boolean
  reorder: (lines: OrderLine[]) => Promise<ReorderOutcome>
}

/**
 * Puts a past order back into the basket.
 *
 * Prices are read again rather than copied from the order: last week's price
 * is not this week's, and refilling a basket at a stale one would show a total
 * that the checkout then refuses. For the same reason a product that has left
 * the catalogue or run out is left behind and named, instead of being added as
 * a line that cannot be bought.
 *
 * Gifts are skipped: a free unit comes from a promotion, and asking for it
 * again would be asking to be given something.
 */
export function useReorder(): ReorderState {
  const { addItem } = useCart()
  const [isPending, setIsPending] = useState(false)

  const reorder = useCallback(async (lines: OrderLine[]): Promise<ReorderOutcome> => {
    const wanted = lines.filter(line => !line.isGift && line.quantity > 0)
    if (wanted.length === 0) {
      return { added: 0, missing: [] }
    }

    setIsPending(true)
    try {
      const ids = [...new Set(wanted.map(line => line.productId))]
      const res = await apiFetch(`/api/search/products?productIds=${ids.join(',')}&inStockOnly=false&limit=50`)
      if (!res.ok) {
        throw new Error('Impossible de retrouver ces produits.')
      }
      const data = await res.json() as { results?: FreshProduct[] }
      const fresh = new Map((data.results ?? []).map(result => [result.product.id, result]))

      const missing: string[] = []
      let added = 0
      for (const line of wanted) {
        const found = fresh.get(line.productId)
        if (!found || !found.product.inStock) {
          missing.push(found?.product.name ?? 'Un produit')
          continue
        }
        const input: AddItemInput = {
          productId: found.product.id,
          supplierId: found.supplier.id,
          supplierName: found.supplier.shopName,
          name: found.product.name,
          imageUrl: found.product.thumbnail ?? found.product.photo,
          pricePerUnit: found.product.promotionalPrice ?? found.product.pricePerUnit,
          unit: found.product.unit,
          quantity: line.quantity,
          promotionTypes: found.product.promotionTypes,
        }
        addItem(input)
        added += 1
      }
      return { added, missing }
    }
    finally {
      setIsPending(false)
    }
  }, [addItem])

  return { isPending, reorder }
}
