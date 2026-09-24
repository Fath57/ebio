import { z } from 'zod'

/**
 * Ce qui définit les produits d'une section.
 *
 * Les noms reprennent ceux de la recherche : une section n'est qu'une
 * recherche enregistrée, et tout ce que la recherche sait faire vaut ici.
 */
export const homeSectionCriteriaSchema = z.object({
  categorySlug: z.string().optional(),
  supplierId: z.string().uuid().optional(),
  validatedOnly: z.boolean().optional(),
  promoOnly: z.boolean().optional(),
  minRating: z.number().min(1).max(5).optional(),
  maxPrice: z.number().positive().optional(),
  newerThanDays: z.number().int().min(1).max(365).optional(),
  /** Rayon en kilomètres autour de l'acheteur. */
  maxDistanceKm: z.number().positive().max(500).optional(),
  sortBy: z.enum(['distance', 'rating', 'price']).optional(),
}).meta({ title: 'HomeSectionCriteria' })

/**
 * Les pictogrammes que l'application sait dessiner.
 *
 * Fermée volontairement : un nom libre laisserait un trou dans le rail le jour
 * où quelqu'un écrit autre chose.
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
  /** Les produits d'une section composée à la main, dans l'ordre voulu. */
  productIds: z.array(z.string().uuid()).max(50).nullable().optional(),
  active: z.boolean().optional(),
  limit: z.number().int().min(1).max(30).optional(),
}).meta({
  title: 'HomeSectionInput',
  description: 'Une section de l\'accueil',
})

/** Réordonner : la liste complète des identifiants, dans l'ordre voulu. */
export const homeSectionOrderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
}).meta({
  title: 'HomeSectionOrder',
  description: 'L\'ordre des sections de l\'accueil',
})

export type HomeSectionInput = z.infer<typeof homeSectionInputSchema>
export type HomeSectionOrderInput = z.infer<typeof homeSectionOrderSchema>
