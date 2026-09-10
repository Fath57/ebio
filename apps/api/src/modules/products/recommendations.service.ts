import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'
import { Product } from './entities/product.entity'
import { PromotionsService } from './promotions.service'

export type RecommendationReason = 'BOUGHT_TOGETHER' | 'PROMO' | 'POPULAR' | 'NEW'

export interface Recommendation {
  product: Product
  reason: RecommendationReason
}

const MAX_ITEMS = 8

interface RankedRow {
  id: string
  co_score: string | number
  sales: string | number
  has_promo: boolean
}

/**
 * "Complete your basket": products of the same shop, ranked by how often
 * they were ordered together with the given ones, then by live promotions,
 * then by sales, then by novelty — so a young shop with no history still
 * gets sensible suggestions. Same shop only: one order, one shop.
 */
@Injectable()
export class RecommendationsService {
  constructor(
    private readonly em: EntityManager,
    private readonly promotions: PromotionsService,
  ) {}

  async forBasket(supplierId: string, productIds: string[], limit = 4): Promise<Recommendation[]> {
    const size = Math.min(Math.max(limit, 1), MAX_ITEMS)
    // knex expands a JS array into a comma list: pass the Postgres literal form.
    const basket = `{${productIds.join(',')}}`
    const rows = await this.em.getConnection().execute(
      `WITH basket AS (SELECT unnest(?::uuid[]) AS product_id),
       settled AS (
         SELECT id FROM orders WHERE status NOT IN ('PENDING_PAYMENT', 'CANCELLED')
       ),
       together AS (
         SELECT oi2.product_id, COUNT(DISTINCT oi2.order_id) AS score
         FROM order_items oi1
         JOIN order_items oi2 ON oi2.order_id = oi1.order_id AND oi2.product_id <> oi1.product_id AND oi2.is_gift = false
         JOIN settled s ON s.id = oi1.order_id
         WHERE oi1.product_id IN (SELECT product_id FROM basket)
           AND oi2.product_id NOT IN (SELECT product_id FROM basket)
         GROUP BY oi2.product_id
       ),
       sales AS (
         SELECT oi.product_id, COUNT(*) AS n
         FROM order_items oi JOIN settled s ON s.id = oi.order_id
         WHERE oi.is_gift = false
         GROUP BY oi.product_id
       )
       SELECT p.id,
              COALESCE(t.score, 0) AS co_score,
              COALESCE(sa.n, 0) AS sales,
              EXISTS (
                SELECT 1 FROM product_promotions pp
                WHERE pp.product_id = p.id AND pp.is_active = true
                  AND pp.starts_at <= NOW() AND (pp.ends_at IS NULL OR pp.ends_at > NOW())
              ) AS has_promo
       FROM products p
       LEFT JOIN together t ON t.product_id = p.id
       LEFT JOIN sales sa ON sa.product_id = p.id
       WHERE p.supplier_id = ?
         AND p.status = 'ACTIVE' AND p.stock > 0
         AND p.id NOT IN (SELECT product_id FROM basket)
       ORDER BY co_score DESC, has_promo DESC, sales DESC, p."createdAt" DESC
       LIMIT ?`,
      [basket, supplierId, size],
    ) as RankedRow[]
    if (rows.length === 0) {
      return []
    }

    const products = await this.em.find(Product, { id: { $in: rows.map(r => r.id) } }, { populate: ['category'] })
    const byId = new Map(products.map(p => [p.id, p]))
    return rows.flatMap((row) => {
      const product = byId.get(row.id)
      if (!product) {
        return []
      }
      const reason: RecommendationReason = Number(row.co_score) > 0
        ? 'BOUGHT_TOGETHER'
        : row.has_promo ? 'PROMO' : Number(row.sales) > 0 ? 'POPULAR' : 'NEW'
      return [{ product, reason }]
    })
  }

  /** Live promotion types per product, for the badges on the suggestion cards. */
  async promotionTypes(productIds: string[]) {
    return this.promotions.liveByProduct(productIds)
  }
}
