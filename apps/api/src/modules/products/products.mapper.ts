import type { ExportProfileStatus, TerroirExportability } from '../terroir/contracts/terroir.contract'
import type { ExportProfile } from '../terroir/entities/export-profile.entity'
import type { ExportThresholds } from '../terroir/export-criteria'
import type { ProductExportability } from '../terroir/exportability.service'
import type { ProductExportProfile, ProductResponse } from './contracts/product.contract'
import type { ProductPromotion } from './entities/product-promotion.entity'
import type { ProductVariant } from './entities/product-variant.entity'
import type { Product } from './entities/product.entity'
import { thumbnailUrlFor } from '../../common/media-urls'
import { availableQuantity } from '../orders/order-stock'
import { toExportProfileResponse } from '../terroir/export-profile.mapper'
import { PromotionsService } from './promotions.service'

/** The legacy promo price, only while it is running, started and not over. */
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
      moderationStatus: product.moderationStatus,
      moderationReason: product.moderationReason ?? null,
      ratingAvg: product.ratingAvg ?? null,
      ratingCount: product.ratingCount,
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
        // Apps read `stock` to cap the quantity: for a pack it is computed, so
        // even an app that knows nothing of packs sells no more than the shelf holds.
        stock: availableQuantity(product.stock, v),
        packSize: v.packSize ?? null,
        createdAt: v.createdAt.toISOString(),
        updatedAt: v.updatedAt.toISOString(),
      })),
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    }
  }

  /** What the owning shop reads of its export profile. */
  static toExportProfile(profile: ExportProfile | null, thresholds: ExportThresholds): ProductExportProfile | null {
    return profile ? toExportProfileResponse(profile, thresholds) : null
  }

  /** « Mode Valise »: whether the product can go in the suitcase. */
  static toExportability(item: ProductExportability): TerroirExportability {
    return { status: item.status, label: item.label, reason: item.reason, packedWeightG: item.packedWeightG }
  }

  /** `exportStatuses` given (owner's list): each summary carries its export status. */
  static toSummary(product: Product, promotions: ProductPromotion[] = [], exportStatuses?: Map<string, ExportProfileStatus>) {
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
      moderationStatus: product.moderationStatus,
      moderationReason: product.moderationReason ?? null,
      ratingAvg: product.ratingAvg ?? null,
      ratingCount: product.ratingCount,
      promotionalPrice: livePromotionalPrice(product),
      promotionTypes: promotions.filter(p => p.isLive()).map(p => p.type),
      ...(exportStatuses ? { exportStatus: exportStatuses.get(product.id) ?? null } : {}),
      createdAt: product.createdAt.toISOString(),
    }
  }
}
