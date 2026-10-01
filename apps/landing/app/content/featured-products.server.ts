import type { FeaturedProduct } from './featured-products'
import process from 'node:process'

interface SearchResult {
  supplier: { id: string, shopName: string }
  product: {
    id: string
    name: string
    photo: string | null
    pricePerUnit: number
    promotionalPrice: number | null
    unit: string
    inStock: boolean
  }
}

interface ProductUnit {
  code: string
  label: string
  shortLabel: string
}

const SHOWCASE_SIZE = 8

/** A single shop must not fill the showcase: variety is the whole point. */
const MAX_PER_SHOP = 2

/**
 * Real products from validated shops, for the landing's showcase.
 *
 * Read through the public search, which already filters out withdrawn
 * products and suspended shops. Like the editable content, a failing API
 * must never break the page: the section simply disappears.
 */
export async function fetchFeaturedProducts(): Promise<FeaturedProduct[]> {
  const base = process.env.API_URL ?? 'http://localhost:3000'
  const signal = AbortSignal.timeout(3000)
  try {
    const [searchRes, unitsRes] = await Promise.all([
      fetch(`${base}/api/search/products?validatedOnly=true&sortBy=rating&limit=50`, { signal }),
      fetch(`${base}/api/product-units/active`, { signal }),
    ])
    if (!searchRes.ok) {
      return []
    }
    const { results } = await searchRes.json() as { results: SearchResult[] }
    const units = unitsRes.ok
      ? (await unitsRes.json() as { items: ProductUnit[] }).items
      : []
    return pickVaried(results)
      .slice(0, SHOWCASE_SIZE)
      .map(result => toFeatured(result, units))
  }
  catch {
    return []
  }
}

/**
 * Keeps the search order but caps each shop, so the showcase reads as a
 * market rather than one shop's catalogue.
 */
function pickVaried(results: SearchResult[]): SearchResult[] {
  const perShop = new Map<string, number>()
  const picked: SearchResult[] = []
  for (const result of results) {
    if (!result.product.photo || !result.product.inStock) {
      continue
    }
    const count = perShop.get(result.supplier.id) ?? 0
    if (count >= MAX_PER_SHOP) {
      continue
    }
    perShop.set(result.supplier.id, count + 1)
    picked.push(result)
  }
  return picked
}

function toFeatured(result: SearchResult, units: ProductUnit[]): FeaturedProduct {
  const { product } = result
  const promo = product.promotionalPrice !== null && product.promotionalPrice < product.pricePerUnit
    ? product.promotionalPrice
    : null
  return {
    id: product.id,
    name: product.name,
    photo: product.photo ?? '',
    shopName: result.supplier.shopName,
    price: promo ?? product.pricePerUnit,
    originalPrice: promo === null ? null : product.pricePerUnit,
    unitLabel: unitLabel(product.unit, units),
  }
}

/**
 * The back-office short labels are typed by hand ("PACK DE  6", "BT-150g"):
 * the full label, lowercased, reads better on a price line. Only a true
 * abbreviation such as "kg" is kept as is.
 */
function unitLabel(code: string, units: ProductUnit[]): string {
  const unit = units.find(item => item.code === code)
  if (!unit) {
    return ''
  }
  const short = unit.shortLabel.trim()
  if (short.length > 0 && short.length <= 3) {
    return short
  }
  return unit.label.trim().replace(/\s+/g, ' ').toLowerCase()
}
