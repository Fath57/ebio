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
  createdAt: z.string(),
}).meta({ title: 'Banner' })

export const bannerListSchema = z.object({
  items: z.array(bannerSchema),
  total: z.number(),
}).meta({ title: 'BannerList' })

export type CreateBanner = z.infer<typeof createBannerSchema>
export type UpdateBanner = z.infer<typeof updateBannerSchema>
export type BannerResponse = z.infer<typeof bannerSchema>
