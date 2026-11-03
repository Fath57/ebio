import type { ProductResponse } from '../products/contracts/product.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, NotFoundException } from '@nestjs/common'
import { Certification } from '../products/entities/certification.entity'
import { ProductPromotion } from '../products/entities/product-promotion.entity'
import { ProductVariant } from '../products/entities/product-variant.entity'
import { Product } from '../products/entities/product.entity'
import { ProductMapper } from '../products/products.mapper'

/** Why a buyer would not find or not be able to order this product. */
export type VisibilityIssue
  = | 'SHOP_NOT_VALIDATED'
    | 'SHOP_NOT_LOCATED'
    | 'SHOP_CONTACT_ONLY'
    | 'PRODUCT_HIDDEN'
    | 'PENDING_REVIEW'
    | 'REJECTED'
    | 'WITHDRAWN'
    | 'OUT_OF_STOCK'
    | 'NO_PHOTO'

export interface AdminProductDetail {
  product: ProductResponse
  categoryName: string | null
  unit: string
  shop: { id: string, shopName: string, validationStatus: string, mode: string, located: boolean, ownerName: string | null, ownerPhone: string | null }
  /** Names and logos of the labels the product carries, from the back-office catalogue. */
  certifications: Array<{ code: string, name: string, logoUrl: string | null, isActive: boolean }>
  sales: { unitsSold: number, orderCount: number, revenue: number, cancelledUnits: number, lastSoldAt: string | null }
  recentOrders: Array<{ id: string, orderNumber: string, status: string, quantity: number, variantLabel: string | null, total: number, buyerName: string | null, createdAt: string }>
  reviews: {
    average: number | null
    count: number
    latest: Array<{ id: string, rating: number, comment: string | null, buyerName: string | null, isHidden: boolean, createdAt: string }>
  }
  /** Empty when a buyer nearby can find and order it. */
  visibilityIssues: VisibilityIssue[]
}

/**
 * The back office's view of a product: the shop's page plus what only staff
 * needs — how it sells, who bought it lately, what buyers think, and every
 * reason it might not show up in the app.
 */
@Injectable()
export class AdminProductDetailService {
  constructor(private readonly em: EntityManager) {}

  async getDetail(productId: string): Promise<AdminProductDetail> {
    const product = await this.em.findOne(Product, { id: productId }, { populate: ['category', 'supplier', 'supplier.user'] })
    if (!product) {
      throw new NotFoundException('Produit introuvable')
    }
    const connection = this.em.getConnection()

    const [variants, promotions, certifications, salesRows, orderRows, reviewRows, locatedRows] = await Promise.all([
      this.em.find(ProductVariant, { product: product.id }, { orderBy: { createdAt: 'ASC' } }),
      this.em.find(ProductPromotion, { product: product.id }, { orderBy: { startsAt: 'DESC' } }),
      product.labels.length > 0 ? this.em.find(Certification, { code: { $in: product.labels } }) : Promise.resolve([]),
      connection.execute(
        `SELECT COALESCE(SUM(oi.quantity) FILTER (WHERE o.status NOT IN ('PENDING_PAYMENT', 'CANCELLED')), 0) AS units_sold,
                COUNT(DISTINCT oi.order_id) FILTER (WHERE o.status NOT IN ('PENDING_PAYMENT', 'CANCELLED')) AS order_count,
                COALESCE(SUM(oi.total_price) FILTER (WHERE o.status NOT IN ('PENDING_PAYMENT', 'CANCELLED')), 0) AS revenue,
                COALESCE(SUM(oi.quantity) FILTER (WHERE o.status = 'CANCELLED'), 0) AS cancelled_units,
                MAX(o."createdAt") FILTER (WHERE o.status NOT IN ('PENDING_PAYMENT', 'CANCELLED')) AS last_sold_at
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE oi.product_id = ?`,
        [product.id],
      ) as Promise<Array<Record<string, unknown>>>,
      connection.execute(
        `SELECT o.id, o.order_number, o.status, o."createdAt" AS created_at, oi.quantity, oi.total_price,
                pv.label AS variant_label, u.name AS buyer_name
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         LEFT JOIN product_variants pv ON pv.id = oi.variant_id
         LEFT JOIN users u ON u.id = o.buyer_id
         WHERE oi.product_id = ? AND o.status <> 'PENDING_PAYMENT'
         ORDER BY o."createdAt" DESC
         LIMIT 10`,
        [product.id],
      ) as Promise<Array<Record<string, unknown>>>,
      connection.execute(
        `SELECT r.id, r.rating, r.comment, r.is_hidden, r."createdAt" AS created_at, u.name AS buyer_name
         FROM product_reviews r LEFT JOIN users u ON u.id = r.buyer_id
         WHERE r.product_id = ?
         ORDER BY r."createdAt" DESC
         LIMIT 5`,
        [product.id],
      ) as Promise<Array<Record<string, unknown>>>,
      connection.execute(`SELECT location IS NOT NULL AS located FROM suppliers WHERE id = ?`, [product.supplier.id]) as Promise<Array<{ located: boolean }>>,
    ])

    const sales = salesRows[0] ?? {}
    const supplier = product.supplier
    const located = Boolean(locatedRows[0]?.located)
    const issues: VisibilityIssue[] = []
    if (supplier.validationStatus !== 'VALIDATED')
      issues.push('SHOP_NOT_VALIDATED')
    if (!located)
      issues.push('SHOP_NOT_LOCATED')
    if (supplier.mode === 'CONTACT')
      issues.push('SHOP_CONTACT_ONLY')
    if (product.status === 'HIDDEN')
      issues.push('PRODUCT_HIDDEN')
    if (product.moderationStatus === 'PENDING')
      issues.push('PENDING_REVIEW')
    if (product.moderationStatus === 'REJECTED')
      issues.push('REJECTED')
    if (product.moderationStatus === 'WITHDRAWN')
      issues.push('WITHDRAWN')
    if (product.stock <= 0 || product.status === 'OUT_OF_STOCK')
      issues.push('OUT_OF_STOCK')
    if ((product.photos ?? []).length === 0)
      issues.push('NO_PHOTO')

    return {
      product: ProductMapper.toResponse(product, variants, promotions),
      categoryName: product.category?.name ?? null,
      unit: product.unit,
      shop: {
        id: supplier.id,
        shopName: supplier.shopName,
        validationStatus: supplier.validationStatus,
        mode: supplier.mode,
        located,
        ownerName: supplier.user?.name ?? null,
        ownerPhone: supplier.user?.phone ?? null,
      },
      certifications: product.labels.map((code) => {
        const found = certifications.find(item => item.code === code)
        return { code, name: found?.name ?? code, logoUrl: found?.logoUrl ?? null, isActive: found?.isActive ?? false }
      }),
      sales: {
        unitsSold: Number(sales.units_sold ?? 0),
        orderCount: Number(sales.order_count ?? 0),
        revenue: Number(sales.revenue ?? 0),
        cancelledUnits: Number(sales.cancelled_units ?? 0),
        lastSoldAt: iso(sales.last_sold_at),
      },
      recentOrders: orderRows.map(row => ({
        id: row.id as string,
        orderNumber: row.order_number as string,
        status: row.status as string,
        quantity: Number(row.quantity ?? 0),
        variantLabel: (row.variant_label as string | null) ?? null,
        total: Number(row.total_price ?? 0),
        buyerName: (row.buyer_name as string | null) ?? null,
        createdAt: iso(row.created_at) ?? '',
      })),
      reviews: {
        average: product.ratingAvg ?? null,
        count: product.ratingCount ?? 0,
        latest: reviewRows.map(row => ({
          id: row.id as string,
          rating: Number(row.rating ?? 0),
          comment: (row.comment as string | null) ?? null,
          buyerName: (row.buyer_name as string | null) ?? null,
          isHidden: row.is_hidden === true,
          createdAt: iso(row.created_at) ?? '',
        })),
      },
      visibilityIssues: issues,
    }
  }
}

function iso(value: unknown): string | null {
  if (!value)
    return null
  const date = value instanceof Date ? value : new Date(value as string)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
