import { z } from 'zod'

// ----------------------
// Payment Method Output
// ----------------------

export const paymentMethodOutputSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string(),
  type: z.enum(['mobile', 'card']),
  provider: z.enum(['fedapay', 'stripe', 'pawerpayer']),
  countryCode: z.string(),
  commission: z.number(),
  priority: z.number().int(),
  active: z.boolean(),
  useFedapayCheckout: z.boolean(),
  supportsPayout: z.boolean(),
  supportsRefund: z.boolean(),
  icon: z.string().nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({
  title: 'PaymentMethodOutput',
  description: 'Payment method details (admin view)',
})

export type PaymentMethodOutput = z.infer<typeof paymentMethodOutputSchema>

// ----------------------
// Available Payment Method (public)
// ----------------------

export const availablePaymentMethodSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string(),
  type: z.enum(['mobile', 'card']),
  useFedapayCheckout: z.boolean(),
  requiresPhone: z.boolean(),
  icon: z.string().nullish(),
}).meta({
  title: 'AvailablePaymentMethod',
  description: 'Payment method visible to the user (no provider details)',
})

export type AvailablePaymentMethod = z.infer<typeof availablePaymentMethodSchema>

// ----------------------
// Pagination Meta
// ----------------------

export const paginationMetaSchema = z.object({
  itemCount: z.number().int(),
  pageSize: z.number().int(),
  offset: z.number().int(),
  hasMore: z.boolean(),
}).meta({
  title: 'PaginationMeta',
  description: 'Pagination metadata',
})

// ----------------------
// Admin List Response
// ----------------------

export const paymentMethodListSchema = z.object({
  data: z.array(paymentMethodOutputSchema),
  meta: paginationMetaSchema,
}).meta({
  title: 'PaymentMethodList',
  description: 'Paginated list of payment methods',
})

export type PaymentMethodList = z.infer<typeof paymentMethodListSchema>

// ----------------------
// Available Methods Response
// ----------------------

export const availablePaymentMethodsSchema = z.object({
  methods: z.array(availablePaymentMethodSchema),
}).meta({
  title: 'AvailablePaymentMethods',
  description: 'List of available payment methods for a country',
})

export type AvailablePaymentMethods = z.infer<typeof availablePaymentMethodsSchema>

// ----------------------
// Admin List Query
// ----------------------

export const listPaymentMethodsQuerySchema = z.object({
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  countryCode: z.string().max(3).optional(),
  provider: z.enum(['fedapay', 'stripe', 'pawerpayer']).optional(),
  type: z.enum(['mobile', 'card']).optional(),
  active: z.enum(['true', 'false']).optional(),
}).meta({
  title: 'ListPaymentMethodsQuery',
  description: 'Query parameters for listing payment methods',
})

export type ListPaymentMethodsQuery = z.infer<typeof listPaymentMethodsQuerySchema>

// ----------------------
// Create Payment Method
// ----------------------

export const createPaymentMethodSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(255),
  type: z.enum(['mobile', 'card']),
  provider: z.enum(['fedapay', 'stripe', 'pawerpayer']),
  countryCode: z.string().min(2).max(3),
  commission: z.number().min(0).max(100).default(0),
  priority: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
  useFedapayCheckout: z.boolean().default(false),
  supportsPayout: z.boolean().default(false),
  supportsRefund: z.boolean().default(false),
}).meta({
  title: 'CreatePaymentMethodInput',
  description: 'Input for creating a payment method',
})

export type CreatePaymentMethodInput = z.infer<typeof createPaymentMethodSchema>

// ----------------------
// Update Payment Method
// ----------------------

export const updatePaymentMethodSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  code: z.string().min(1).max(255).optional(),
  type: z.enum(['mobile', 'card']).optional(),
  provider: z.enum(['fedapay', 'stripe', 'pawerpayer']).optional(),
  countryCode: z.string().min(2).max(3).optional(),
  commission: z.number().min(0).max(100).optional(),
  priority: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
  useFedapayCheckout: z.boolean().optional(),
  supportsPayout: z.boolean().optional(),
  supportsRefund: z.boolean().optional(),
  icon: z.string().max(500).optional(),
}).meta({
  title: 'UpdatePaymentMethodInput',
  description: 'Input for updating a payment method',
})

export type UpdatePaymentMethodInput = z.infer<typeof updatePaymentMethodSchema>

// ----------------------
// Message Response
// ----------------------

export const messageResponseSchema = z.object({
  message: z.string(),
}).meta({
  title: 'MessageResponse',
  description: 'Simple message response',
})
