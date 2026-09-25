import { z } from 'zod'

/**
 * What defines a section's products.
 *
 * The names mirror the search: a section is only a saved search, and
 * everything the search can do holds here.
 */
export const homeSectionCriteriaSchema = z.object({
  categorySlug: z.string().optional(),
  supplierId: z.string().uuid().optional(),
  validatedOnly: z.boolean().optional(),
  promoOnly: z.boolean().optional(),
  minRating: z.number().min(1).max(5).optional(),
  maxPrice: z.number().positive().optional(),
  newerThanDays: z.number().int().min(1).max(365).optional(),
  /** Radius in kilometres around the buyer. */
  maxDistanceKm: z.number().positive().max(500).optional(),
  sortBy: z.enum(['distance', 'rating', 'price']).optional(),
}).meta({ title: 'HomeSectionCriteria' })

/**
 * The icons the app knows how to draw.
 *
 * Deliberately closed: a free-form name would leave a hole in the rail the day
 * someone types something else.
 */
export const HOME_SECTION_ICONS = [
  'map-pin',
  'badge-check',
  'tag',
  'sparkles',
  'star',
  'leaf',
  'flame',
  'clock',
] as const

export const homeSectionInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  icon: z.enum(HOME_SECTION_ICONS).nullable().optional(),
  subtitle: z.string().trim().max(200).nullable().optional(),
  mode: z.enum(['CRITERIA', 'MANUAL']),
  criteria: homeSectionCriteriaSchema.nullable().optional(),
  /** The products of a hand-picked section, in the order intended. */
  productIds: z.array(z.string().uuid()).max(50).nullable().optional(),
  active: z.boolean().optional(),
  limit: z.number().int().min(1).max(30).optional(),
}).meta({
  title: 'HomeSectionInput',
  description: 'Une section de l\'accueil',
})

/** Reordering: the full list of ids, in the order intended. */
export const homeSectionOrderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
}).meta({
  title: 'HomeSectionOrder',
  description: 'L\'ordre des sections de l\'accueil',
})

export type HomeSectionInput = z.infer<typeof homeSectionInputSchema>
export type HomeSectionOrderInput = z.infer<typeof homeSectionOrderSchema>
