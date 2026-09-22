import type { CreateProductReviews, ProductReviewsResponse, RateableProductsResponse } from './contracts/product-review.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { thumbnailUrlFor } from '../../common/media-urls'
import { ContentReport, ReportStatus, ReportTargetType } from '../admin/entities/content-report.entity'
import { User } from '../auth/auth.entity'
import { OrderItem } from '../orders/entities/order-item.entity'
import { Order, OrderStatus } from '../orders/entities/order.entity'
import { Product } from '../products/entities/product.entity'
import { ProductReview } from './entities/product-review.entity'
import { FraudDetectionService } from './fraud-detection.service'

/** Below this, the average stays hidden — the rule shops already follow. */
const MIN_REVIEWS_FOR_AVERAGE = 3

/** Recent reviews weigh double, as they do for shops. */
const RECENT_WINDOW_DAYS = 90

@Injectable()
export class ProductReviewsService {
  constructor(
    private readonly em: EntityManager,
    private readonly fraudDetection: FraudDetectionService,
  ) {}

  /**
   * What the rating step offers: the lines of a delivered order, carrying the
   * review already left on each. An order that is not delivered yields an
   * empty list rather than an error — the step is then skipped, not broken.
   */
  async listRateableItems(orderId: string, buyerId: string): Promise<RateableProductsResponse> {
    const order = await this.em.findOne(Order, { id: orderId }, { populate: ['buyer'] })
    if (!order) {
      throw new NotFoundException('Commande introuvable')
    }
    if (order.buyer.id !== buyerId) {
      throw new BadRequestException('Cette commande ne vous appartient pas')
    }
    if (order.status !== OrderStatus.DELIVERED) {
      return { items: [] }
    }

    const items = await this.em.find(
      OrderItem,
      { order: { id: orderId } },
      { populate: ['product'] },
    )
    const reviews = await this.em.find(ProductReview, { orderItem: { $in: items.map(i => i.id) } })
    const byItem = new Map(reviews.map(r => [r.orderItem.id, r]))

    return {
      items: items.map((item) => {
        const review = byItem.get(item.id)
        return {
          orderItemId: item.id,
          productId: item.product.id,
          productName: item.product.name,
          // A thumbnail only exists for media the platform optimised; a
          // seeded or external URL has none, and the full photo is the
          // documented fallback rather than an empty square.
          thumbnail: thumbnailUrlFor(item.product.photos[0]) ?? item.product.photos[0] ?? null,
          existingReview: review ? { rating: review.rating, comment: review.comment ?? null } : null,
        }
      }),
    }
  }

  /**
   * Records the whole rating step at once.
   *
   * A line already reviewed is skipped, not refused: a retry after a dropped
   * connection must not fail the batch over a duplicate. The unique constraint
   * guarantees the outcome; the count says what happened.
   */
  async createMany(
    orderId: string,
    buyerId: string,
    data: CreateProductReviews,
  ): Promise<{ created: number, skipped: number }> {
    const order = await this.em.findOne(Order, { id: orderId }, { populate: ['buyer'] })
    if (!order) {
      throw new NotFoundException('Commande introuvable')
    }
    if (order.buyer.id !== buyerId) {
      throw new BadRequestException('Cette commande ne vous appartient pas')
    }
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('Seule une commande livrée peut être notée')
    }

    const items = await this.em.find(
      OrderItem,
      { order: { id: orderId } },
      { populate: ['product'] },
    )
    const byId = new Map(items.map(i => [i.id, i]))

    // Every line must belong to this order: an id from elsewhere would let
    // someone review a product they never bought.
    for (const input of data.reviews) {
      if (!byId.has(input.orderItemId)) {
        throw new BadRequestException('Cet article ne fait pas partie de la commande')
      }
    }

    const already = await this.em.find(ProductReview, {
      orderItem: { $in: data.reviews.map(r => r.orderItemId) },
    })
    const reviewed = new Set(already.map(r => r.orderItem.id))

    const touchedProducts = new Set<string>()
    let created = 0
    for (const input of data.reviews) {
      if (reviewed.has(input.orderItemId)) {
        continue
      }
      const item = byId.get(input.orderItemId)!
      this.em.create(ProductReview, {
        orderItem: this.em.getReference(OrderItem, item.id),
        product: this.em.getReference(Product, item.product.id),
        buyer: order.buyer,
        rating: input.rating,
        comment: input.comment,
      })
      touchedProducts.add(item.product.id)
      created += 1
    }

    await this.em.flush()

    for (const productId of touchedProducts) {
      await this.recalculateProductRating(productId)
    }

    // Same signal the shop reviews raise: it logs, it does not block.
    if (created > 0) {
      await this.fraudDetection.detectMultipleAccounts(buyerId)
    }

    return { created, skipped: data.reviews.length - created }
  }

  /**
   * The product page's reading path: a summary over every visible review, and
   * one page of them.
   *
   * The distribution is computed over the whole set, not the page — five bars
   * describing twenty reviews out of two hundred would describe nothing. The
   * average is read from the product's own column rather than recomputed, so
   * the figure shown next to the price and the one shown in the section can
   * never disagree.
   */
  async getProductReviews(productId: string, page = 1, limit = 20): Promise<ProductReviewsResponse> {
    const product = await this.em.findOne(Product, { id: productId })
    if (!product) {
      throw new NotFoundException('Produit introuvable')
    }

    const [reviews, total] = await this.em.findAndCount(
      ProductReview,
      { product: { id: productId }, isHidden: false },
      {
        populate: ['buyer'],
        orderBy: { createdAt: 'DESC' },
        limit,
        offset: (page - 1) * limit,
      },
    )

    const rows = await this.em.getConnection().execute(
      `SELECT rating, COUNT(*)::int as count
       FROM product_reviews
       WHERE product_id = ? AND is_hidden = false
       GROUP BY rating`,
      [productId],
    )
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const row of rows as Array<{ rating: number, count: number }>) {
      distribution[row.rating as 1 | 2 | 3 | 4 | 5] = row.count
    }

    return {
      summary: {
        average: product.ratingAvg ?? null,
        count: product.ratingCount,
        distribution,
      },
      reviews: reviews.map(review => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment ?? null,
        authorName: review.buyer.name,
        createdAt: review.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        hasMore: page * limit < total,
      },
    }
  }

  /**
   * Files a report against a review. The review stays visible: a report is a
   * request for a decision, not the decision itself.
   *
   * This actually writes, unlike `POST /reviews/:id/report` for shop reviews,
   * which returns `{ reported: true }` and records nothing.
   */
  async reportReview(reviewId: string, reporterId: string, reason: string): Promise<{ reported: boolean }> {
    const review = await this.em.findOne(ProductReview, { id: reviewId })
    if (!review) {
      throw new NotFoundException('Avis introuvable')
    }

    // One pending report per reviewer and review: signalling twice is not
    // two problems.
    const existing = await this.em.findOne(ContentReport, {
      targetType: ReportTargetType.PRODUCT_REVIEW,
      targetId: reviewId,
      reporter: { id: reporterId },
      status: ReportStatus.PENDING,
    })
    if (existing) {
      return { reported: true }
    }

    this.em.create(ContentReport, {
      reporter: this.em.getReference(User, reporterId),
      targetType: ReportTargetType.PRODUCT_REVIEW,
      targetId: reviewId,
      reason,
    })
    await this.em.flush()
    return { reported: true }
  }

  /**
   * The moderation queue: pending reports on product reviews, each carrying
   * the review it targets so the moderator decides without a second call.
   *
   * Scoped to product reviews rather than listing every `content_reports`
   * row: shop reviews, publications and messages have no moderation screen
   * yet, and a queue mixing four kinds nobody can act on is noise.
   */
  async listPendingReports(): Promise<{
    items: Array<{
      reportId: string
      reason: string
      reportedAt: string
      review: { id: string, rating: number, comment: string | null, authorName: string, isHidden: boolean, productId: string } | null
    }>
  }> {
    const reports = await this.em.find(
      ContentReport,
      { targetType: ReportTargetType.PRODUCT_REVIEW, status: ReportStatus.PENDING },
      { orderBy: { createdAt: 'DESC' }, limit: 100 },
    )
    if (reports.length === 0) {
      return { items: [] }
    }

    const reviews = await this.em.find(
      ProductReview,
      { id: { $in: reports.map(r => r.targetId) } },
      { populate: ['buyer', 'product'] },
    )
    const byId = new Map(reviews.map(r => [r.id, r]))

    return {
      items: reports.map((report) => {
        const review = byId.get(report.targetId)
        return {
          reportId: report.id,
          reason: report.reason,
          reportedAt: report.createdAt.toISOString(),
          // A review deleted since the report leaves the row without a target.
          review: review
            ? {
                id: review.id,
                rating: review.rating,
                comment: review.comment ?? null,
                authorName: review.buyer.name,
                isHidden: review.isHidden,
                productId: review.product.id,
              }
            : null,
        }
      }),
    }
  }

  /**
   * Hides or restores a review, and settles the reports that asked for it.
   * The product's average is recomputed either way — a hidden review must
   * leave the figure, and a restored one must return to it.
   */
  async setVisibility(reviewId: string, hidden: boolean, adminId: string): Promise<{ hidden: boolean }> {
    const review = await this.em.findOne(ProductReview, { id: reviewId }, { populate: ['product'] })
    if (!review) {
      throw new NotFoundException('Avis introuvable')
    }

    review.isHidden = hidden

    const reports = await this.em.find(ContentReport, {
      targetType: ReportTargetType.PRODUCT_REVIEW,
      targetId: reviewId,
      status: ReportStatus.PENDING,
    })
    for (const report of reports) {
      report.status = hidden ? ReportStatus.RESOLVED : ReportStatus.DISMISSED
      report.resolvedBy = this.em.getReference(User, adminId)
      report.resolvedAt = new Date()
    }

    await this.em.flush()
    await this.recalculateProductRating(review.product.id)
    return { hidden }
  }

  /**
   * Recomputes a product's average and count from its visible reviews.
   *
   * Same weighting as `RatingsService.recalculateRating`, minus the four
   * criteria: the rating is already a single number. Hence the `::numeric`
   * cast — the shop version divides by `4.0` and gets its float for free,
   * whereas summing smallints over integers here would divide as integers
   * and turn an average of 4.2 into 4. The average stays null
   * below the threshold, which drops the product to the end of a `NULLS LAST`
   * ordering with no extra code.
   */
  async recalculateProductRating(productId: string): Promise<void> {
    const rows = await this.em.getConnection().execute(
      `SELECT COALESCE(
        SUM(rating::numeric * CASE WHEN "createdAt" >= NOW() - INTERVAL '${RECENT_WINDOW_DAYS} days' THEN 2 ELSE 1 END)
        / NULLIF(SUM(CASE WHEN "createdAt" >= NOW() - INTERVAL '${RECENT_WINDOW_DAYS} days' THEN 2 ELSE 1 END), 0),
        0
      ) as weighted_avg,
      COUNT(*)::int as total
      FROM product_reviews WHERE product_id = ? AND is_hidden = false`,
      [productId],
    )

    const { weighted_avg: weightedAvg, total } = rows[0]
    await this.em.nativeUpdate(Product, { id: productId }, {
      ratingAvg: total >= MIN_REVIEWS_FOR_AVERAGE ? Number(Number(weightedAvg).toFixed(1)) : null,
      ratingCount: total,
    })
  }
}
