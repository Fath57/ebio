import { z } from 'zod'

/**
 * One review of one product, identified by the order line that allows it.
 * A comment without a rating is rejected: the mobile step only reveals the
 * comment field once a star has been touched, and the contract says the same.
 */
const productReviewInputSchema = z.object({
  orderItemId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
})

/**
 * The whole rating step travels in one request. Three products rated means
 * one round trip, not three — on a mobile network, three sequential calls are
 * three chances to half-fail.
 */
export const createProductReviewsSchema = z.object({
  reviews: z.array(productReviewInputSchema).min(1).max(50),
}).meta({ title: 'CreateProductReviews', description: 'Rate the products of a delivered order' })

export const createProductReviewsResponseSchema = z.object({
  created: z.number().int(),
  /**
   * Lines already reviewed. Ignored rather than refused, so a retry after a
   *  dropped connection never fails the whole batch.
   */
  skipped: z.number().int(),
}).meta({ title: 'CreateProductReviewsResponse' })

export const rateableProductSchema = z.object({
  orderItemId: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string(),
  thumbnail: z.string().nullable(),
  existingReview: z.object({
    rating: z.number().int(),
    comment: z.string().nullable(),
  }).nullable(),
}).meta({ title: 'RateableProduct' })

export const rateableProductsResponseSchema = z.object({
  items: z.array(rateableProductSchema),
}).meta({ title: 'RateableProductsResponse' })

export const productReviewSchema = z.object({
  id: z.string().uuid(),
  rating: z.number().int(),
  comment: z.string().nullable(),
  authorName: z.string(),
  createdAt: z.string().datetime(),
}).meta({ title: 'ProductReview' })

/**
 * The distribution covers every visible review, not just the requested page:
 * the five bars on the product page would otherwise describe nothing.
 */
export const productReviewSummarySchema = z.object({
  average: z.number().nullable(),
  count: z.number().int(),
  distribution: z.object({
    1: z.number().int(),
    2: z.number().int(),
    3: z.number().int(),
    4: z.number().int(),
    5: z.number().int(),
  }),
}).meta({ title: 'ProductReviewSummary' })

export const productReviewsResponseSchema = z.object({
  summary: productReviewSummarySchema,
  reviews: z.array(productReviewSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    hasMore: z.boolean(),
  }),
}).meta({ title: 'ProductReviewsResponse' })

export const reportProductReviewSchema = z.object({
  reason: z.string().min(1).max(500),
}).meta({ title: 'ReportProductReview' })

export type CreateProductReviews = z.infer<typeof createProductReviewsSchema>
export type ProductReviewsResponse = z.infer<typeof productReviewsResponseSchema>
export type RateableProductsResponse = z.infer<typeof rateableProductsResponseSchema>
