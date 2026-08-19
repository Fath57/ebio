import {
  createFilterQueryStringSchema,
  createPaginationQuerySchema,
  paginatedSchema,
} from '@lonestone/nzoth/server'
import { z } from 'zod'

/**
 * Free-form code rather than an enum: the list of units is managed from the
 * backoffice, and a schema frozen at build time would reject every unit added
 * after it. `ProductUnitsService` checks the code against the table.
 */
export const productUnitCode = z.string().min(1).max(32).meta({
  title: 'ProductUnitCode',
  description: 'Code of a unit of sale, from the product units reference list',
})

export const productStatusEnum = z.enum(['ACTIVE', 'OUT_OF_STOCK', 'HIDDEN']).meta({
  title: 'ProductStatus',
  description: 'Product visibility and availability status',
})

const variantInputSchema = z.object({
  label: z.string().min(1).max(100),
  pricePerUnit: z.number().min(0),
  stock: z.number().int().min(0).optional(),
})

export const createProductSchema = z.object({
  name: z.string().min(2).max(200),
  categoryId: z.string().uuid(),
  description: z.string().max(2000).optional(),
  pricePerUnit: z.number().min(0),
  unit: productUnitCode,
  stock: z.number().int().min(0).default(0),
  stockAlertThreshold: z.number().int().min(0).default(5),
  status: productStatusEnum.default('ACTIVE'),
  variants: z.array(variantInputSchema).optional(),
  mediaIds: z.array(z.string().uuid()).optional(),
}).meta({
  title: 'CreateProduct',
  description: 'Data required to create a new product',
})

export const updateProductSchema = createProductSchema.partial().meta({
  title: 'UpdateProduct',
  description: 'Update product — all fields optional',
})

export const stockUpdateSchema = z.object({
  stock: z.number().int().min(0),
}).meta({
  title: 'StockUpdate',
  description: 'Update product stock level',
})

export const promotionSchema = z.object({
  promotionalPrice: z.number().min(0),
  expiresAt: z.string().datetime(),
}).meta({
  title: 'Promotion',
  description: 'Set a promotional price on a product',
})

const variantResponseSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  pricePerUnit: z.number(),
  stock: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const productResponseSchema = z.object({
  id: z.string().uuid(),
  supplierId: z.string().uuid(),
  categoryId: z.string().uuid(),
  categoryName: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  voiceDescriptionUrl: z.string().nullable(),
  photos: z.array(z.string()),
  pricePerUnit: z.number(),
  unit: productUnitCode,
  stock: z.number(),
  stockAlertThreshold: z.number(),
  status: productStatusEnum,
  promotionalPrice: z.number().nullable(),
  promotionExpiresAt: z.string().datetime().nullable(),
  variants: z.array(variantResponseSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).meta({
  title: 'ProductResponse',
  description: 'Full product with variants',
})

export const productSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  photo: z.string().nullable(),
  pricePerUnit: z.number(),
  unit: productUnitCode,
  stock: z.number(),
  status: productStatusEnum,
  promotionalPrice: z.number().nullable(),
}).meta({
  title: 'ProductSummary',
  description: 'Minimal product info for lists',
})

// Pagination & filtering for product lists
export const productPaginationSchema = createPaginationQuerySchema()
export type ProductPagination = z.infer<typeof productPaginationSchema>

export const enabledProductFilteringKeys = ['status', 'categoryId'] as const
export const productFilteringSchema = createFilterQueryStringSchema(enabledProductFilteringKeys)
export type ProductFiltering = z.infer<typeof productFilteringSchema>

export const productListSchema = paginatedSchema(productSummarySchema).meta({
  title: 'ProductList',
  description: 'Paginated list of product summaries',
})

export type CreateProduct = z.infer<typeof createProductSchema>
export type UpdateProduct = z.infer<typeof updateProductSchema>
export type StockUpdate = z.infer<typeof stockUpdateSchema>
export type Promotion = z.infer<typeof promotionSchema>
export type ProductResponse = z.infer<typeof productResponseSchema>
export type ProductSummary = z.infer<typeof productSummarySchema>
export type ProductList = z.infer<typeof productListSchema>
