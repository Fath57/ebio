import { z } from 'zod'

/**
 * A kept product, in the shape the product card already reads.
 *
 * Deliberately the same object the search returns: the mobile list reuses its
 * card as it is, and a second shape would mean a second card to keep in step
 * with the first.
 */
export const favoriteSchema = z.object({
  supplier: z.object({
    id: z.string().uuid(),
    shopName: z.string(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    distance: z.number(),
    rating: z.number().nullable(),
    reviewCount: z.number(),
    mode: z.enum(['CONTACT', 'ORDER']),
    badges: z.array(z.enum(['VALIDATED', 'TOP_SELLER', 'CERTIFIED_BIO'])),
    isOpen: z.boolean(),
  }),
  product: z.object({
    id: z.string().uuid(),
    name: z.string(),
    photo: z.string().nullable(),
    thumbnail: z.string().nullable(),
    pricePerUnit: z.number(),
    unit: z.string(),
    inStock: z.boolean(),
    promotionalPrice: z.number().nullable(),
    ratingAvg: z.number().nullable(),
    ratingCount: z.number(),
    promotionTypes: z.array(z.string()),
  }),
  /** When it was kept, newest first in the list. */
  savedAt: z.string(),
}).meta({
  title: 'Favorite',
  description: 'Un produit mis de côté par l\'acheteur',
})

export const favoritesResponseSchema = z.object({
  items: z.array(favoriteSchema),
  total: z.number(),
}).meta({
  title: 'FavoritesResponse',
  description: 'Les produits mis de côté, du plus récent au plus ancien',
})

/**
 * Which of these products are kept.
 *
 * A product page asks for one; a list of cards asks for the whole page at
 * once, rather than one request per card.
 */
export const favoriteIdsQuerySchema = z.object({
  productIds: z.preprocess(
    value => typeof value === 'string' ? value.split(',').filter(Boolean) : value,
    z.array(z.string().uuid()).max(50),
  ),
}).meta({ title: 'FavoriteIdsQuery' })

export const favoriteIdsResponseSchema = z.object({
  productIds: z.array(z.string().uuid()),
}).meta({
  title: 'FavoriteIdsResponse',
  description: 'Parmi les identifiants demandés, ceux qui sont en favori',
})

export type FavoriteResponse = z.infer<typeof favoriteSchema>
export type FavoritesResponse = z.infer<typeof favoritesResponseSchema>
export type FavoriteIdsQuery = z.infer<typeof favoriteIdsQuerySchema>
