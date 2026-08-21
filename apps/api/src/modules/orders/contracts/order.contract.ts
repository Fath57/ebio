import { z } from 'zod'

export const orderStatusEnum = z.enum([
  'PENDING_PAYMENT',
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'IN_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'DISPUTED',
]).meta({
  title: 'OrderStatus',
  description: 'Current status of an order',
})

export const pickupModeEnum = z.enum(['ON_SITE', 'DELIVERY']).meta({
  title: 'PickupMode',
  description: 'How the buyer will receive the order',
})

export const paymentMethodEnum = z.enum(['FEDAPAY', 'CASH_ON_DELIVERY', 'WALLET']).meta({
  title: 'PaymentMethod',
  description: 'Payment method for the order',
})

export const disputeStatusEnum = z.enum(['OPEN', 'RESOLVED', 'REJECTED']).meta({
  title: 'DisputeStatus',
  description: 'Status of a dispute',
})

export const orderItemInputSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  quantity: z.number().int().min(1),
}).meta({
  title: 'OrderItemInput',
  description: 'A single item in the order',
})

export const createOrderSchema = z.object({
  supplierId: z.string().uuid(),
  pickupMode: pickupModeEnum,
  paymentMethod: paymentMethodEnum,
  deliveryAddress: z.string().min(5).max(500).optional(),
  deliverySlot: z.string().max(200).optional(),
  items: z.array(orderItemInputSchema).min(1),
}).meta({
  title: 'CreateOrder',
  description: 'Data required to place a new order',
  examples: [
    {
      supplierId: '550e8400-e29b-41d4-a716-446655440000',
      pickupMode: 'DELIVERY',
      paymentMethod: 'FEDAPAY',
      deliveryAddress: '123 Rue de Cotonou',
      items: [
        { productId: '550e8400-e29b-41d4-a716-446655440001', quantity: 2 },
      ],
    },
  ],
})

export const updateOrderStatusSchema = z.object({
  status: z.enum(['PREPARING', 'READY', 'IN_DELIVERY']),
}).meta({
  title: 'UpdateOrderStatus',
  description: 'Update order status (supplier only)',
})

export const rejectOrderSchema = z.object({
  reason: z.string().min(5).max(500),
}).meta({
  title: 'RejectOrder',
  description: 'Reason for rejecting an order',
})

export const createDisputeSchema = z.object({
  reason: z.string().min(10).max(2000),
}).meta({
  title: 'CreateDispute',
  description: 'Open a dispute on an order',
})

export const orderItemSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string(),
  productPhoto: z.string().url().nullable(),
  variantId: z.string().uuid().nullable(),
  variantLabel: z.string().nullable(),
  quantity: z.number(),
  unitPrice: z.number(),
  totalPrice: z.number(),
}).meta({
  title: 'OrderItem',
  description: 'An item within an order response',
})

export const orderResponseSchema = z.object({
  id: z.string().uuid(),
  orderNumber: z.string(),
  buyerId: z.string().uuid(),
  buyerName: z.string(),
  supplierId: z.string().uuid(),
  supplierName: z.string(),
  status: orderStatusEnum,
  pickupMode: pickupModeEnum,
  paymentMethod: paymentMethodEnum,
  deliveryAddress: z.string().nullable(),
  deliverySlot: z.string().nullable(),
  deliveryFee: z.number(),
  totalAmount: z.number(),
  commissionRate: z.number(),
  commissionAmount: z.number(),
  deliveryConfirmedByBuyer: z.boolean(),
  deliveryConfirmedBySupplier: z.boolean(),
  acceptedAt: z.string().datetime().nullable(),
  deliveredAt: z.string().datetime().nullable(),
  escrowReleasedAt: z.string().datetime().nullable(),
  items: z.array(orderItemSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).meta({
  title: 'OrderResponse',
  description: 'Full order details with items',
})

export const disputeResponseSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  openedById: z.string().uuid(),
  reason: z.string(),
  status: disputeStatusEnum,
  adminNotes: z.string().nullable(),
  resolvedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
}).meta({
  title: 'DisputeResponse',
  description: 'Dispute details',
})

export type CreateOrder = z.infer<typeof createOrderSchema>
export type UpdateOrderStatus = z.infer<typeof updateOrderStatusSchema>
export type RejectOrder = z.infer<typeof rejectOrderSchema>
export type CreateDispute = z.infer<typeof createDisputeSchema>
export type OrderItemInput = z.infer<typeof orderItemInputSchema>
export type OrderResponse = z.infer<typeof orderResponseSchema>
export type DisputeResponse = z.infer<typeof disputeResponseSchema>
