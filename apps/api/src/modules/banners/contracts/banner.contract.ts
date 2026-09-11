import { z } from 'zod'

export const bannerTargetTypeEnum = z.enum(['SUPPLIER', 'PRODUCT', 'URL', 'NONE']).meta({
  title: 'BannerTargetType',
  description: 'What the banner points to when tapped',
})

/** Each type carries its own destination field; the others must stay empty. */
function checkTargetShape(
  data: { targetType?: string, targetId?: string | null, targetUrl?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (data.targetType === undefined) {
    return
  }
  const needsId = data.targetType === 'SUPPLIER' || data.targetType === 'PRODUCT'
  if (needsId && !data.targetId) {
    ctx.addIssue({ code: 'custom', path: ['targetId'], message: 'La cible est requise pour ce type' })
  }
  if (data.targetType === 'URL' && !data.targetUrl) {
    ctx.addIssue({ code: 'custom', path: ['targetUrl'], message: 'Le lien est requis pour ce type' })
  }
}

const bannerBaseSchema = z.object({
  title: z.string().min(1).max(255),
  subtitle: z.string().max(255).optional(),
  imageUrl: z.string().url().max(1024),
  targetType: bannerTargetTypeEnum,
  targetId: z.string().uuid().nullable().optional(),
  targetUrl: z.string().url().max(1024).nullable().optional(),
  isActive: z.boolean().default(true),
  position: z.number().int().min(0).default(0),
  /** Diffusion window; null = unbounded. */
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
})

export const createBannerSchema = bannerBaseSchema.superRefine(checkTargetShape).meta({
  title: 'CreateBanner',
  description: 'Data required to create a home banner',
})

export const updateBannerSchema = bannerBaseSchema.partial().superRefine(checkTargetShape).meta({
  title: 'UpdateBanner',
  description: 'Update a banner — every field optional',
})

export const bannerSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  subtitle: z.string().nullable(),
  imageUrl: z.string(),
  targetType: bannerTargetTypeEnum,
  targetId: z.string().uuid().nullable(),
  targetUrl: z.string().nullable(),
  /** Libellé de la cible, résolu à la lecture — `null` si elle a disparu. */
  targetLabel: z.string().nullable(),
  isActive: z.boolean(),
  position: z.number(),
  /** Paid by a shop (sponsored) rather than editorial. */
  sponsored: z.boolean(),
  supplierId: z.string().uuid().nullable(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  impressions: z.number(),
  clicks: z.number(),
  createdAt: z.string(),
}).meta({ title: 'Banner' })

export const bannerRequestStatusEnum = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).meta({
  title: 'BannerRequestStatus',
  description: 'Lifecycle of a sponsored banner request',
})

export const createBannerRequestSchema = z.object({
  title: z.string().min(1).max(60),
  subtitle: z.string().max(80).optional(),
  /** Public URL of the uploaded 2:1 image (media context BANNER_IMAGE). */
  imageUrl: z.string().url().max(1024),
  /** The shop itself or one of its products. */
  targetType: z.enum(['SUPPLIER', 'PRODUCT']),
  targetId: z.string().uuid().optional(),
  /** Must match one of the platform offers. */
  durationDays: z.number().int().min(1).max(365),
  requestedStartAt: z.string().datetime().optional(),
}).meta({
  title: 'CreateBannerRequest',
  description: 'A shop asks (and pays) for a home banner slot',
})

export const bannerRequestSchema = z.object({
  id: z.string().uuid(),
  supplierId: z.string().uuid(),
  supplierName: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  imageUrl: z.string(),
  targetType: z.enum(['SUPPLIER', 'PRODUCT']),
  targetId: z.string().uuid().nullable(),
  targetLabel: z.string().nullable(),
  durationDays: z.number(),
  price: z.number(),
  requestedStartAt: z.string().nullable(),
  status: bannerRequestStatusEnum,
  rejectionReason: z.string().nullable(),
  /** Set once approved: the live banner with its window and counters. */
  banner: z.object({
    id: z.string().uuid(),
    startsAt: z.string().nullable(),
    endsAt: z.string().nullable(),
    isActive: z.boolean(),
    impressions: z.number(),
    clicks: z.number(),
  }).nullable(),
  paidAt: z.string().nullable(),
  refundedAt: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  createdAt: z.string(),
}).meta({ title: 'BannerRequest' })

export const approveBannerRequestSchema = z.object({
  /** Defaults to the requested start, or now. */
  startsAt: z.string().datetime().optional(),
  position: z.number().int().min(0).optional(),
}).meta({ title: 'ApproveBannerRequest' })

export const rejectBannerRequestSchema = z.object({
  reason: z.string().min(5).max(500),
}).meta({ title: 'RejectBannerRequest' })

export type CreateBannerRequest = z.infer<typeof createBannerRequestSchema>
export type BannerRequestResponse = z.infer<typeof bannerRequestSchema>
export type ApproveBannerRequest = z.infer<typeof approveBannerRequestSchema>
export type RejectBannerRequest = z.infer<typeof rejectBannerRequestSchema>

export const bannerListSchema = z.object({
  items: z.array(bannerSchema),
  total: z.number(),
}).meta({ title: 'BannerList' })

export type CreateBanner = z.infer<typeof createBannerSchema>
export type UpdateBanner = z.infer<typeof updateBannerSchema>
export type BannerResponse = z.infer<typeof bannerSchema>
