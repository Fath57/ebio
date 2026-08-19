import { z } from 'zod'

/**
 * Uppercase and punctuation-free: the code lands in `products.unit` and in
 * every API payload, so it has to stay stable and unambiguous.
 */
export const productUnitCodeSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[A-Z0-9_]+$/, 'Le code doit être en majuscules, sans espace ni accent')

export const createProductUnitSchema = z.object({
  code: productUnitCodeSchema,
  label: z.string().min(1).max(64),
  shortLabel: z.string().min(1).max(16),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
}).meta({
  title: 'CreateProductUnit',
  description: 'Data required to add a unit of sale',
})

/**
 * The code is left out on purpose: renaming it would orphan every product
 * already sold in that unit. A wrong code is replaced by a new unit.
 */
export const updateProductUnitSchema = createProductUnitSchema
  .omit({ code: true })
  .partial()
  .meta({
    title: 'UpdateProductUnit',
    description: 'Update a unit of sale — every field optional, the code is immutable',
  })

export const productUnitSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  label: z.string(),
  shortLabel: z.string(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  /** Number of products currently priced in this unit. */
  productCount: z.number(),
}).meta({ title: 'ProductUnit' })

export const productUnitListSchema = z.object({
  items: z.array(productUnitSchema),
  total: z.number(),
}).meta({ title: 'ProductUnitList' })

export type CreateProductUnit = z.infer<typeof createProductUnitSchema>
export type UpdateProductUnit = z.infer<typeof updateProductUnitSchema>
export type ProductUnitResponse = z.infer<typeof productUnitSchema>
