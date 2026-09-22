import type { CreateProductPromotion, ProductPromotionResponse } from './contracts/product.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Supplier } from '../suppliers/supplier.entity'
import { ProductPromotion, PromotionAuthor, PromotionType } from './entities/product-promotion.entity'
import { Product } from './entities/product.entity'

/**
 * Dated promotions on products. Who created one pays for it: a shop's own
 * promotion comes out of its price, a platform promotion is compensated to the
 * shop at settlement (same rule as promo codes).
 *
 * The legacy `promotional_price` / `promotion_expires_at` columns are kept as
 * a projection of the live PRICE promotion so older app versions keep working.
 */
@Injectable()
export class PromotionsService {
  constructor(private readonly em: EntityManager) {}

  /** Live promotions of one product, most recent first. */
  async listForProduct(productId: string, includeInactive = false): Promise<ProductPromotion[]> {
    const rows = await this.em.find(ProductPromotion, { product: { id: productId } }, { orderBy: { createdAt: 'DESC' } })
    return includeInactive ? rows : rows.filter(p => p.isLive())
  }

  /** Live promotions for a set of products, keyed by product id. */
  async liveByProduct(productIds: string[]): Promise<Map<string, ProductPromotion[]>> {
    const map = new Map<string, ProductPromotion[]>()
    if (productIds.length === 0) {
      return map
    }
    const rows = await this.em.find(ProductPromotion, { product: { id: { $in: productIds } }, isActive: true })
    for (const row of rows) {
      if (!row.isLive()) {
        continue
      }
      const list = map.get(row.product.id) ?? []
      list.push(row)
      map.set(row.product.id, list)
    }
    return map
  }

  async create(product: Product, author: PromotionAuthor, data: CreateProductPromotion): Promise<ProductPromotion> {
    if (data.type === PromotionType.PRICE) {
      if (data.promoPrice === undefined || data.promoPrice >= product.pricePerUnit) {
        throw new BadRequestException('Le prix promotionnel doit être inférieur au prix normal')
      }
    }
    if (data.type === PromotionType.BOGO && (!data.buyQty || !data.getQty)) {
      throw new BadRequestException('Indiquez les quantités achetée et offerte')
    }
    const type = data.type as PromotionType
    const startsAt = data.startsAt ? new Date(data.startsAt) : new Date()
    const endsAt = data.endsAt ? new Date(data.endsAt) : null
    if (endsAt && endsAt <= startsAt) {
      throw new BadRequestException('La date de fin doit être après la date de début')
    }

    // One live promotion per type and product: the new one replaces the old.
    const existing = await this.em.find(ProductPromotion, { product: { id: product.id }, type, isActive: true })
    for (const old of existing) {
      old.isActive = false
    }

    const promotion = this.em.create(ProductPromotion, {
      product,
      supplier: this.em.getReference(Supplier, product.supplier.id),
      createdBy: author,
      type,
      promoPrice: data.type === PromotionType.PRICE ? data.promoPrice : null,
      buyQty: data.type === PromotionType.BOGO ? data.buyQty : null,
      getQty: data.type === PromotionType.BOGO ? data.getQty : null,
      startsAt,
      endsAt,
    })
    if (data.type === PromotionType.PRICE) {
      product.promotionalPrice = data.promoPrice
      // A promotion scheduled for later must not discount the product today:
      // the mirrored window carries its start as well as its end.
      product.promotionStartsAt = startsAt
      product.promotionExpiresAt = endsAt ?? undefined
    }
    await this.em.flush()
    return promotion
  }

  async remove(productId: string, promotionId: string): Promise<void> {
    const promotion = await this.em.findOne(ProductPromotion, { id: promotionId, product: { id: productId } }, { populate: ['product'] })
    if (!promotion) {
      throw new NotFoundException('Promotion introuvable')
    }
    promotion.isActive = false
    if (promotion.type === PromotionType.PRICE) {
      promotion.product.promotionalPrice = undefined
      promotion.product.promotionStartsAt = undefined
      promotion.product.promotionExpiresAt = undefined
    }
    await this.em.flush()
  }

  /** Free units earned on a line: floor(qty / buyQty) × getQty. */
  static giftUnits(promotion: ProductPromotion, quantity: number): number {
    if (promotion.type !== PromotionType.BOGO || !promotion.buyQty || !promotion.getQty) {
      return 0
    }
    return Math.floor(quantity / promotion.buyQty) * promotion.getQty
  }

  static toResponse(promotion: ProductPromotion): ProductPromotionResponse {
    return {
      id: promotion.id,
      type: promotion.type,
      promoPrice: promotion.promoPrice ?? null,
      buyQty: promotion.buyQty ?? null,
      getQty: promotion.getQty ?? null,
      startsAt: promotion.startsAt.toISOString(),
      endsAt: promotion.endsAt?.toISOString() ?? null,
      createdBy: promotion.createdBy,
      isActive: promotion.isActive,
    }
  }
}
