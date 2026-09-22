import type { ProductResponse } from './contracts/product.contract'
import type { ProductPromotion } from './entities/product-promotion.entity'
import type { ProductVariant } from './entities/product-variant.entity'
import type { Product } from './entities/product.entity'
import { thumbnailUrlFor } from '../../common/media-urls'
import { PromotionsService } from './promotions.service'

/** The legacy promo price, only while it is running — started and not over. */
export function livePromotionalPrice(
  product: Pick<Product, 'promotionalPrice' | 'promotionStartsAt' | 'promotionExpiresAt'>,
): number | null {
  if (product.promotionalPrice == null) {
    return null
  }
  const now = new Date()
  if (product.promotionStartsAt && product.promotionStartsAt > now) {
    return null
  }
  if (product.promotionExpiresAt && product.promotionExpiresAt <= now) {
    return null
  }
  return product.promotionalPrice
}

export class ProductMapper {
  static toResponse(product: Product, variants: ProductVariant[] = [], promotions: ProductPromotion[] = []): ProductResponse {
    return {
      id: product.id,
      supplierId: product.supplier?.id ?? '',
      categoryId: product.category?.id ?? '',
      categoryName: product.category?.name ?? '',
      name: product.name,
      description: product.description ?? null,
      voiceDescriptionUrl: product.voiceDescriptionUrl ?? null,
      photos: product.photos,
      thumbnail: thumbnailUrlFor(product.photos[0]),
      pricePerUnit: product.pricePerUnit,
      unit: product.unit,
      stock: product.stock,
      stockAlertThreshold: product.stockAlertThreshold,
      status: product.status,
      promotionalPrice: livePromotionalPrice(product),
      promotionExpiresAt: livePromotionalPrice(product) === null ? null : product.promotionExpiresAt?.toISOString() ?? null,
      promotions: promotions.filter(p => p.isLive()).map(PromotionsService.toResponse),
      ingredients: product.ingredients ?? null,
      allergens: product.allergens ?? [],
      labels: product.labels ?? [],
      origin: product.origin ?? null,
      conservation: product.conservation ?? null,
      nutritionalValues: product.nutritionalValues
        ? { ...product.nutritionalValues, basis: product.nutritionalValues.basis ?? '100g' }
        : null,
      variants: variants.map(v => ({
        id: v.id,
        label: v.label,
        pricePerUnit: v.pricePerUnit,
        stock: v.stock,
        createdAt: v.createdAt.toISOString(),
        updatedAt: v.updatedAt.toISOString(),
      })),
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    }
  }

  static toSummary(product: Product, promotions: ProductPromotion[] = []) {
    return {
      id: product.id,
      name: product.name,
      photo: product.photos[0] ?? null,
      thumbnail: thumbnailUrlFor(product.photos[0]),
      categoryName: product.category?.name ?? null,
      pricePerUnit: product.pricePerUnit,
      unit: product.unit,
      stock: product.stock,
      status: product.status,
      promotionalPrice: livePromotionalPrice(product),
      promotionTypes: promotions.filter(p => p.isLive()).map(p => p.type),
      createdAt: product.createdAt.toISOString(),
    }
  }
}
