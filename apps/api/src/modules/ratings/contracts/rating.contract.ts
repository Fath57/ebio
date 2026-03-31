import { z } from 'zod'

export const createReviewSchema = z.object({
  supplierId: z.string().uuid(),
  orderId: z.string().uuid().optional(),
  transactionType: z.enum(['ORDER', 'CONTACT']),
  qualityRating: z.number().int().min(1).max(5),
  delayRating: z.number().int().min(1).max(5),
  communicationRating: z.number().int().min(1).max(5),
  conformityRating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
}).meta({ title: 'CreateReview', description: 'Submit a review for a supplier' })

export const reviewResponseSchema = z.object({
  id: z.string().uuid(),
  buyer: z.object({ id: z.string().uuid(), name: z.string(), image: z.string().nullable() }),
  qualityRating: z.number(),
  delayRating: z.number(),
  communicationRating: z.number(),
  conformityRating: z.number(),
  comment: z.string().nullable(),
  transactionType: z.enum(['ORDER', 'CONTACT']),
  createdAt: z.string().datetime(),
}).meta({ title: 'ReviewResponse' })

export const reviewSummarySchema = z.object({
  averageRating: z.number(),
  totalReviews: z.number(),
  qualityAvg: z.number(),
  delayAvg: z.number(),
  communicationAvg: z.number(),
  conformityAvg: z.number(),
  distribution: z.object({
    1: z.number(),
    2: z.number(),
    3: z.number(),
    4: z.number(),
    5: z.number(),
  }),
}).meta({ title: 'ReviewSummary' })

export const badgeResponseSchema = z.object({
  type: z.enum(['VALIDATED', 'TOP_SELLER', 'CERTIFIED_BIO']),
  grantedAt: z.string().datetime(),
}).meta({ title: 'BadgeResponse' })

export type CreateReview = z.infer<typeof createReviewSchema>
export type ReviewResponse = z.infer<typeof reviewResponseSchema>
