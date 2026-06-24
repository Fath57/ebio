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
  sortBy: z.enum(['distance', 'rating', 'price']).default('distance'),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().max(50).default(20),
}).meta({ title: 'SearchProductsQuery', description: 'Geolocation-based product search' })

export const searchResultSchema = z.object({
  supplier: z.object({
    id: z.string().uuid(),
    shopName: z.string(),
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
    pricePerUnit: z.number(),
    unit: z.string(),
    inStock: z.boolean(),
    promotionalPrice: z.number().nullable(),
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
