/**
 * Product promotions as the API exposes them (apps/api/src/modules/products/
 * contracts/product.contract.ts): full objects on a product detail, bare
 * types on list rows. This module turns both into French copy.
 */

export type PromotionType = 'PRICE' | 'BOGO' | 'FREE_DELIVERY'

export interface ProductPromotion {
  type: PromotionType
  promoPrice: number | null
  buyQty: number | null
  getQty: number | null
  endsAt: string | null
  /** SUPPLIER funds its own promotion; PLATFORM = eBio pays the shop back. */
  createdBy: 'SUPPLIER' | 'PLATFORM'
}

function isPromotionType(value: unknown): value is PromotionType {
  return value === 'PRICE' || value === 'BOGO' || value === 'FREE_DELIVERY'
}

/** Live promotions from a product response; anything malformed is dropped. */
export function parsePromotions(data: unknown): ProductPromotion[] {
  if (!Array.isArray(data)) {
    return []
  }
  const promotions: ProductPromotion[] = []
  for (const raw of data as unknown[]) {
    if (raw === null || typeof raw !== 'object') {
      continue
    }
    const row = raw as Record<string, unknown>
    if (!isPromotionType(row.type)) {
      continue
    }
    promotions.push({
      type: row.type,
      promoPrice: typeof row.promoPrice === 'number' ? row.promoPrice : null,
      buyQty: typeof row.buyQty === 'number' ? row.buyQty : null,
      getQty: typeof row.getQty === 'number' ? row.getQty : null,
      endsAt: typeof row.endsAt === 'string' ? row.endsAt : null,
      createdBy: row.createdBy === 'PLATFORM' ? 'PLATFORM' : 'SUPPLIER',
    })
  }
  return promotions
}

/** Short chip labels for a list row: "1+1" and "Livraison offerte" (price promos already show a percentage). */
export function promotionChipLabels(types: string[] | undefined): string[] {
  const labels: string[] = []
  if (types?.includes('BOGO')) {
    labels.push('1+1')
  }
  if (types?.includes('FREE_DELIVERY')) {
    labels.push('Livraison offerte')
  }
  return labels
}

/** Chip labels for a product detail, with the real buy/get quantities. */
export function promotionChipLabelsFor(promotions: ProductPromotion[]): string[] {
  const labels: string[] = []
  const bogo = promotions.find(p => p.type === 'BOGO')
  if (bogo) {
    labels.push(`${bogo.buyQty ?? 1}+${bogo.getQty ?? 1}`)
  }
  if (promotions.some(p => p.type === 'FREE_DELIVERY')) {
    labels.push('Livraison offerte')
  }
  return labels
}

function formatEndDate(endsAt: string): string | null {
  const date = new Date(endsAt)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

function pluralUnits(count: number, singular: string, plural: string): string {
  return `${count} ${count > 1 ? plural : singular}`
}

/** One promotion in plain French, e.g. "2 achetés, 1 offert · jusqu'au 12 mars". */
export function describePromotion(promotion: ProductPromotion, formatPrice: (value: number) => string): string {
  let text: string
  if (promotion.type === 'BOGO') {
    const buy = promotion.buyQty ?? 1
    const get = promotion.getQty ?? 1
    text = `${pluralUnits(buy, 'acheté', 'achetés')}, ${pluralUnits(get, 'offert', 'offerts')}`
  }
  else if (promotion.type === 'FREE_DELIVERY') {
    text = promotion.createdBy === 'PLATFORM'
      ? 'Livraison offerte par eBio avec ce produit'
      : 'Livraison offerte par la boutique avec ce produit'
  }
  else {
    text = promotion.promoPrice !== null
      ? `Prix promotionnel : ${formatPrice(promotion.promoPrice)} FCFA`
      : 'Prix promotionnel'
  }
  const until = promotion.endsAt ? formatEndDate(promotion.endsAt) : null
  return until ? `${text} · jusqu'au ${until}` : text
}
