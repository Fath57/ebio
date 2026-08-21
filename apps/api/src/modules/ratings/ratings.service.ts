import type { CreateReview } from './contracts/rating.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { Order, OrderStatus } from '../orders/entities/order.entity'
import { Supplier } from '../suppliers/supplier.entity'
import { Badge, BadgeType } from './entities/badge.entity'
import { Review, TransactionType } from './entities/review.entity'

const TOP_SELLER_MIN_RATING = 4.5
const TOP_SELLER_MIN_TRANSACTIONS = 20
const TOP_SELLER_WINDOW_DAYS = 90

@Injectable()
export class RatingsService {
  constructor(private readonly em: EntityManager) {}

  async createReview(buyerId: string, data: CreateReview): Promise<Review> {
    const supplier = await this.em.findOne(Supplier, { id: data.supplierId })
    if (!supplier)
      throw new NotFoundException('Fournisseur introuvable')

    if (data.transactionType === TransactionType.ORDER && data.orderId) {
      const order = await this.em.findOne(Order, {
        id: data.orderId,
        buyer: { id: buyerId },
        status: OrderStatus.DELIVERED,
      })
      if (!order)
        throw new BadRequestException('Commande non trouvée ou non livrée')

      const existing = await this.em.findOne(Review, { buyer: { id: buyerId }, order: { id: data.orderId } })
      if (existing)
        throw new BadRequestException('Vous avez déjà noté cette commande')
    }

    const review = this.em.create(Review, {
      buyer: this.em.getReference(User, buyerId),
      supplier: this.em.getReference(Supplier, data.supplierId),
      order: data.orderId ? this.em.getReference(Order, data.orderId) : undefined,
      transactionType: data.transactionType as TransactionType,
      qualityRating: data.qualityRating,
      delayRating: data.delayRating,
      communicationRating: data.communicationRating,
      conformityRating: data.conformityRating,
      comment: data.comment,
    })

    await this.em.flush()
    await this.recalculateRating(data.supplierId)
    await this.checkTopSellerEligibility(data.supplierId)

    return review
  }

  async getSupplierReviews(supplierId: string, page = 1, limit = 20) {
    const [reviews, total] = await this.em.findAndCount(
      Review,
      { supplier: { id: supplierId } },
      {
        populate: ['buyer'],
        orderBy: { createdAt: 'DESC' },
        limit,
        offset: (page - 1) * limit,
      },
    )

    const summary = await this.getReviewSummary(supplierId)

    return { reviews, summary, total, hasMore: page * limit < total }
  }

  async getReviewSummary(supplierId: string) {
    const rows = await this.em.getConnection().execute(
      `SELECT
        COUNT(*)::int as total,
        COALESCE(AVG((quality_rating + delay_rating + communication_rating + conformity_rating) / 4.0), 0) as average,
        COALESCE(AVG(quality_rating), 0) as quality_avg,
        COALESCE(AVG(delay_rating), 0) as delay_avg,
        COALESCE(AVG(communication_rating), 0) as communication_avg,
        COALESCE(AVG(conformity_rating), 0) as conformity_avg,
        COUNT(*) FILTER (WHERE (quality_rating + delay_rating + communication_rating + conformity_rating) / 4.0 >= 4.5)::int as stars5,
        COUNT(*) FILTER (WHERE (quality_rating + delay_rating + communication_rating + conformity_rating) / 4.0 >= 3.5 AND (quality_rating + delay_rating + communication_rating + conformity_rating) / 4.0 < 4.5)::int as stars4,
        COUNT(*) FILTER (WHERE (quality_rating + delay_rating + communication_rating + conformity_rating) / 4.0 >= 2.5 AND (quality_rating + delay_rating + communication_rating + conformity_rating) / 4.0 < 3.5)::int as stars3,
        COUNT(*) FILTER (WHERE (quality_rating + delay_rating + communication_rating + conformity_rating) / 4.0 >= 1.5 AND (quality_rating + delay_rating + communication_rating + conformity_rating) / 4.0 < 2.5)::int as stars2,
        COUNT(*) FILTER (WHERE (quality_rating + delay_rating + communication_rating + conformity_rating) / 4.0 < 1.5)::int as stars1
      FROM reviews WHERE supplier_id = ?`,
      [supplierId],
    )

    const row = rows[0]
    return {
      averageRating: Number(Number(row.average).toFixed(1)),
      totalReviews: row.total,
      qualityAvg: Number(Number(row.quality_avg).toFixed(1)),
      delayAvg: Number(Number(row.delay_avg).toFixed(1)),
      communicationAvg: Number(Number(row.communication_avg).toFixed(1)),
      conformityAvg: Number(Number(row.conformity_avg).toFixed(1)),
      distribution: { 1: row.stars1, 2: row.stars2, 3: row.stars3, 4: row.stars4, 5: row.stars5 },
    }
  }

  async getSupplierBadges(supplierId: string) {
    return this.em.find(Badge, { supplier: { id: supplierId } }, { orderBy: { grantedAt: 'DESC' } })
  }

  private async recalculateRating(supplierId: string): Promise<void> {
    // Weighted: last 90 days count 2x, older count 1x
    const rows = await this.em.getConnection().execute(
      `SELECT COALESCE(
        SUM(
          (quality_rating + delay_rating + communication_rating + conformity_rating) / 4.0
          * CASE WHEN "createdAt" >= NOW() - INTERVAL '90 days' THEN 2 ELSE 1 END
        ) / NULLIF(SUM(CASE WHEN "createdAt" >= NOW() - INTERVAL '90 days' THEN 2 ELSE 1 END), 0),
        0
      ) as weighted_avg,
      COUNT(*)::int as total
      FROM reviews WHERE supplier_id = ?`,
      [supplierId],
    )

    const { weighted_avg, total } = rows[0]
    await this.em.nativeUpdate(Supplier, { id: supplierId }, {
      globalRating: total >= 3 ? Number(Number(weighted_avg).toFixed(1)) : null,
      totalReviews: total,
    })
  }

  private async checkTopSellerEligibility(supplierId: string): Promise<void> {
    const supplier = await this.em.findOne(Supplier, { id: supplierId })
    if (!supplier || !supplier.globalRating)
      return

    if (supplier.globalRating < TOP_SELLER_MIN_RATING)
      return

    // Count transactions in last 90 days
    const rows = await this.em.getConnection().execute(
      `SELECT COUNT(*)::int as count FROM reviews
       WHERE supplier_id = ? AND "createdAt" >= NOW() - INTERVAL '${TOP_SELLER_WINDOW_DAYS} days'`,
      [supplierId],
    )

    if (rows[0].count >= TOP_SELLER_MIN_TRANSACTIONS) {
      const existing = await this.em.findOne(Badge, {
        supplier: { id: supplierId },
        type: BadgeType.TOP_SELLER,
      })

      if (!existing) {
        this.em.create(Badge, {
          supplier: this.em.getReference(Supplier, supplierId),
          type: BadgeType.TOP_SELLER,
          grantedBy: 'system',
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        })
        await this.em.flush()
      }
    }
  }
}
