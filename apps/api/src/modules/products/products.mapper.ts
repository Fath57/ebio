import type { ProductResponse } from './contracts/product.contract'
import type { ProductVariant } from './entities/product-variant.entity'
import type { Product } from './entities/product.entity'
import { thumbnailUrlFor } from '../../common/media-urls'

export class ProductMapper {
  static toResponse(product: Product, variants: ProductVariant[] = []): ProductResponse {
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
      promotionalPrice: product.promotionalPrice ?? null,
      promotionExpiresAt: product.promotionExpiresAt?.toISOString() ?? null,
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

  static toSummary(product: Product) {
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
      promotionalPrice: product.promotionalPrice ?? null,
      createdAt: product.createdAt.toISOString(),
    }
  }
}
