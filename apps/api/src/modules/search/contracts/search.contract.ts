import { z } from 'zod'

export const searchProductsQuerySchema = z.object({
  q: z.string().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  radius: z.coerce.number().optional(),
  category: z.string().optional(),
  maxPrice: z.coerce.number().optional(),
  inStockOnly: z.enum(['true', 'false']).default('true').meta({ description: 'Filter in-stock only' }),
  minRating: z.coerce.number().min(1).max(5).optional(),
  mode: z.enum(['CONTACT', 'ORDER']).optional(),
  validatedOnly: z.enum(['true', 'false']).default('false').meta({ description: 'Filter validated suppliers only' }),
  promoOnly: z.enum(['true', 'false']).default('false').meta({ description: 'Filter promotional products only' }),
  /** One specific shop: a section can be dedicated to a single supplier. */
  supplierId: z.string().uuid().optional(),
  /** Listed less than N days ago — what "nouveau" actually means. */
  newerThanDays: z.coerce.number().int().min(1).max(365).optional(),
  /**
   * Products picked one by one.
   *
   * Going through the search rather than a separate query gives the shop, the
   * distance and the promotional price for free — everything a card displays
   * and which would otherwise have to be rebuilt.
   *
   * Read from a query string as well as from code, so a single identifier
   * arrives as text and several as a comma-separated list. Declaring an array
   * alone rejected the one-product case, which is the commonest of all.
   */
  productIds: z.preprocess(
    value => (typeof value === 'string' ? value.split(',').filter(Boolean) : value),
    z.array(z.string().uuid()).max(50),
  ).optional(),
  sortBy: z.enum(['distance', 'rating', 'price']).default('distance'),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().max(50).default(20),
}).meta({ title: 'SearchProductsQuery', description: 'Geolocation-based product search' })

export const searchResultSchema = z.object({
  supplier: z.object({
    id: z.string().uuid(),
    shopName: z.string(),
    /** Coordonnées du point de vente — `null` si le fournisseur n'est pas localisé. */
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
    /** Weighted average of the product's reviews, null below three of them. */
    ratingAvg: z.number().nullable(),
    ratingCount: z.number(),
    /** Live promotion types, for badges (e.g. ['BOGO', 'FREE_DELIVERY']). */
    promotionTypes: z.array(z.string()),
  }),
}).meta({ title: 'SearchResult' })

export const searchResponseSchema = z.object({
  results: z.array(searchResultSchema),
  total: z.number(),
  page: z.number(),
  hasMore: z.boolean(),
}).meta({ title: 'SearchResponse' })

export const autocompleteQuerySchema = z.object({
  q: z.string().min(2),
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
}).meta({ title: 'AutocompleteQuery' })

export const autocompleteResponseSchema = z.object({
  suggestions: z.array(z.object({
    text: z.string(),
    type: z.enum(['product', 'category', 'supplier']),
    id: z.string().uuid().optional(),
  })),
}).meta({ title: 'AutocompleteResponse' })

export const categoriesResponseSchema = z.object({
  categories: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    imageUrl: z.string().nullable(),
    productCount: z.number(),
  })),
}).meta({ title: 'CategoriesResponse' })

export type SearchProductsQuery = z.infer<typeof searchProductsQuerySchema>
export type SearchResult = z.infer<typeof searchResultSchema>
export type SearchResponse = z.infer<typeof searchResponseSchema>
