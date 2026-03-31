import { z } from 'zod'

export const supplierTypeEnum = z.enum(['INPUTS', 'TRANSFORMER']).meta({
  title: 'SupplierType',
  description: 'Type of supplier activity',
})

export const supplierModeEnum = z.enum(['CONTACT', 'ORDER']).meta({
  title: 'SupplierMode',
  description: 'How buyers interact with this supplier',
})

export const validationStatusEnum = z.enum([
  'PENDING',
  'VALIDATED',
  'REJECTED',
  'COMPLEMENT_REQUESTED',
  'SUSPENDED',
]).meta({
  title: 'ValidationStatus',
  description: 'Supplier account validation status',
})

export const openingHoursSchema = z.record(
  z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
  z.object({
    open: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM expected'),
    close: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM expected'),
    closed: z.boolean().optional(),
  }),
).meta({
  title: 'OpeningHours',
  description: 'Weekly opening hours with days as keys',
})

export const deliveryZoneSchema = z.object({
  polygon: z.array(z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })).min(3, 'A polygon must have at least 3 points'),
  deliveryFee: z.number().min(0),
  estimatedMinutes: z.number().int().min(0),
}).meta({
  title: 'DeliveryZone',
  description: 'Delivery zone defined by a polygon with fee and estimated time',
})

export const registerSupplierSchema = z.object({
  shopName: z.string().min(2).max(100),
  type: supplierTypeEnum,
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  address: z.string().min(2).max(255).optional(),
  neighborhood: z.string().min(2).max(100).optional(),
  mobileMoneyNumber: z.string().min(8).max(20),
  mode: supplierModeEnum.default('CONTACT'),
  openingHours: openingHoursSchema.optional(),
}).meta({
  title: 'RegisterSupplier',
  description: 'Data required to register as a supplier',
})

export const updateSupplierSchema = registerSupplierSchema.partial().extend({
  coverPhoto: z.string().url().optional(),
  profilePhoto: z.string().url().optional(),
}).meta({
  title: 'UpdateSupplier',
  description: 'Update supplier profile — all fields optional',
})

export const supplierResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  shopName: z.string(),
  type: supplierTypeEnum,
  coverPhoto: z.string().nullable(),
  profilePhoto: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  address: z.string().nullable(),
  neighborhood: z.string().nullable(),
  mobileMoneyNumber: z.string().nullable(),
  validationStatus: validationStatusEnum,
  mode: supplierModeEnum,
  openingHours: openingHoursSchema.nullable(),
  globalRating: z.number().nullable(),
  totalReviews: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).meta({
  title: 'SupplierResponse',
  description: 'Full supplier profile response',
})

export const supplierSummarySchema = z.object({
  id: z.string().uuid(),
  shopName: z.string(),
  type: supplierTypeEnum,
  profilePhoto: z.string().nullable(),
  neighborhood: z.string().nullable(),
  mode: supplierModeEnum,
  globalRating: z.number().nullable(),
  totalReviews: z.number(),
  validationStatus: validationStatusEnum,
}).meta({
  title: 'SupplierSummary',
  description: 'Minimal supplier info for search results and lists',
})

export const supplierDashboardSchema = z.object({
  pendingOrders: z.number().int(),
  unreadMessages: z.number().int(),
  criticalStockProducts: z.number().int(),
  revenue: z.number(),
  pendingEscrow: z.number(),
  averageRating: z.number().nullable(),
}).meta({
  title: 'SupplierDashboard',
  description: 'Key metrics for the supplier dashboard',
})

export type RegisterSupplier = z.infer<typeof registerSupplierSchema>
export type UpdateSupplier = z.infer<typeof updateSupplierSchema>
export type SupplierResponse = z.infer<typeof supplierResponseSchema>
export type SupplierSummary = z.infer<typeof supplierSummarySchema>
export type SupplierDashboard = z.infer<typeof supplierDashboardSchema>
export type DeliveryZone = z.infer<typeof deliveryZoneSchema>
export type OpeningHours = z.infer<typeof openingHoursSchema>
