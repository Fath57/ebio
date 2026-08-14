import { z } from 'zod'

export const bannerTargetTypeEnum = z.enum(['SUPPLIER', 'PRODUCT']).meta({
  title: 'BannerTargetType',
  description: 'What the banner points to when tapped',
})

export const createBannerSchema = z.object({
  title: z.string().min(1).max(255),
  subtitle: z.string().max(255).optional(),
  imageUrl: z.string().url().max(1024),
  targetType: bannerTargetTypeEnum,
  targetId: z.string().uuid(),
  isActive: z.boolean().default(true),
  position: z.number().int().min(0).default(0),
}).meta({
  title: 'CreateBanner',
  description: 'Data required to create a home banner',
})

export const updateBannerSchema = createBannerSchema.partial().meta({
  title: 'UpdateBanner',
  description: 'Update a banner — every field optional',
})

export const bannerSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  subtitle: z.string().nullable(),
  imageUrl: z.string(),
  targetType: bannerTargetTypeEnum,
  targetId: z.string().uuid(),
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
