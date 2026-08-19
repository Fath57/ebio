import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'

export interface ProductUnit {
  code: string
  label: string
  shortLabel: string
}

/**
 * The five units the platform shipped with. They stand in until the list is
 * fetched, and after a failed fetch: a price with no unit beside it reads worse
 * than one labelled from a slightly stale list.
 */
const FALLBACK_UNITS: ProductUnit[] = [
  { code: 'KG', label: 'Kilogramme', shortLabel: 'kg' },
  { code: 'LITER', label: 'Litre', shortLabel: 'litre' },
  { code: 'SACHET', label: 'Sachet', shortLabel: 'sachet' },
  { code: 'PIECE', label: 'Pièce', shortLabel: 'pièce' },
  { code: 'LOT', label: 'Lot', shortLabel: 'lot' },
]

/**
 * Shared across screens: the reference list changes only when an admin edits
 * it, so refetching it on every product card would be pure noise.
 */
let cachedUnits: ProductUnit[] | null = null

/** Units of sale, as managed from the backoffice. */
export function useProductUnits() {
  const [units, setUnits] = useState<ProductUnit[]>(cachedUnits ?? FALLBACK_UNITS)

  useEffect(() => {
    if (cachedUnits) {
      return
    }
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const res = await apiFetch('/api/product-units/active')
        if (!res.ok || cancelled) {
          return
        }
        const data = await res.json() as { items?: ProductUnit[] }
        const items = data.items ?? []
        if (items.length > 0) {
          cachedUnits = items
          setUnits(items)
        }
      }
      catch {
        // The fallback above stays in place.
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  /** Short form for a price line: « 1 200 FCFA / kg ». Falls back to the code. */
  const shortLabel = useCallback(
    (code: string) => units.find(unit => unit.code === code)?.shortLabel ?? code,
    [units],
  )

  /** Full name, for a picker or a product sheet. */
  const label = useCallback(
    (code: string) => units.find(unit => unit.code === code)?.label ?? code,
    [units],
  )

  return { units, label, shortLabel }
}
