import { z } from 'zod'
import { openingHoursSchema } from './supplier.contract'

export const createSalesPointSchema = z.object({
  name: z.string().min(2).max(100),
  address: z.string().min(2).max(255).optional(),
  phone: z.string().min(8).max(20).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  openingHours: openingHoursSchema.optional(),
  isActive: z.boolean().default(true),
}).meta({
  title: 'CreateSalesPoint',
  description: 'A place where the supplier sells besides the main shop',
})

export const updateSalesPointSchema = createSalesPointSchema.partial().extend({
  /** Explicit null clears the position. */
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
}).meta({
  title: 'UpdateSalesPoint',
  description: 'Update a sales point — every field optional',
})

export const salesPointSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  openingHours: z.record(z.string(), z.unknown()).nullable(),
  isActive: z.boolean(),
  /** Computed with the point's hours, or the shop's when it has none. */
  isOpen: z.boolean().nullable(),
}).meta({ title: 'SalesPoint' })

export const salesPointListSchema = z.object({
  items: z.array(salesPointSchema),
  total: z.number(),
}).meta({ title: 'SalesPointList' })

export type CreateSalesPoint = z.infer<typeof createSalesPointSchema>
export type UpdateSalesPoint = z.infer<typeof updateSalesPointSchema>
export type SalesPointResponse = z.infer<typeof salesPointSchema>
