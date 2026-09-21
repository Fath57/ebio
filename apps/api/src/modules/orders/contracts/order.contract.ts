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
  deliveryAddress: z.string().trim().min(3, 'Adresse de livraison trop courte : indiquez le quartier et un repère').max(500).optional(),
  deliveryLatitude: z.number().min(-90).max(90).optional(),
  deliveryLongitude: z.number().min(-180).max(180).optional(),
  deliverySlot: z.string().max(200).optional(),
  promoCode: z.string().min(1).max(30).optional(),
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
  /** With PREPARING: minutes until the parcel is ready; the courier search starts a little before. */
  prepMinutes: z.number().int().min(1).max(240).optional(),
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
  productThumbnail: z.string().url().nullable(),
  variantId: z.string().uuid().nullable(),
  variantLabel: z.string().nullable(),
  quantity: z.number(),
  unitPrice: z.number(),
  totalPrice: z.number(),
  /** Free unit added by a buy-X-get-Y promotion (unitPrice 0). */
  isGift: z.boolean(),
}).meta({
  title: 'OrderItem',
  description: 'An item within an order response',
})

/** Live courier run attached to an order, for lists and cards (null = none). */
export const orderDeliverySummarySchema = z.object({
  status: z.enum(['AWAITING_COURIER', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED']),
  courierName: z.string().nullable(),
  courierVehicleType: z.enum(['MOTO', 'BICYCLE', 'CAR', 'ON_FOOT']).nullable(),
  /**
   * La tournée dont cette livraison fait partie, quand il y en a une. Elle
   * permet à l'acheteur de voir une seule progression pour un panier qui
   * couvre plusieurs boutiques, au lieu d'en suivre deux en parallèle.
   */
  run: z.object({
    id: z.string().uuid(),
    shopCount: z.number().int().positive(),
    /** Boutiques déjà collectées, sur `shopCount`. */
    collectedCount: z.number().int().min(0),
  }).nullable(),
  updatedAt: z.string().datetime(),
}).meta({
  title: 'OrderDeliverySummary',
  description: 'Current delivery run of an order (shared fleet)',
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
  deliveryLatitude: z.number().nullable(),
  deliveryLongitude: z.number().nullable(),
  deliverySlot: z.string().nullable(),
  deliveryFee: z.number(),
  totalAmount: z.number(),
  discountAmount: z.number(),
  commissionRate: z.number(),
  commissionAmount: z.number(),
  deliveryConfirmedByBuyer: z.boolean(),
  deliveryConfirmedBySupplier: z.boolean(),
  acceptedAt: z.string().datetime().nullable(),
  /** Shop's estimate of readiness while preparing (null otherwise). */
  estimatedReadyAt: z.string().datetime().nullable(),
  deliveredAt: z.string().datetime().nullable(),
  escrowReleasedAt: z.string().datetime().nullable(),
  items: z.array(orderItemSchema),
  delivery: orderDeliverySummarySchema.nullable(),
  /** Le passage en caisse dont la commande est issue ; nul avant le panier unifié. */
  checkoutId: z.string().uuid().nullable(),
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
export const previewOrderSchema = createOrderSchema.pick({
  supplierId: true,
  pickupMode: true,
  deliveryLatitude: true,
  deliveryLongitude: true,
  promoCode: true,
  items: true,
}).meta({
  title: 'PreviewOrder',
  description: 'Basket as it would be charged: promotions, gifts, discount and delivery fee',
})

export const orderPreviewLineSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable(),
  name: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  regularPrice: z.number(),
  totalPrice: z.number(),
  isGift: z.boolean(),
  promotionType: z.enum(['PRICE', 'BOGO', 'FREE_DELIVERY']).nullable(),
}).meta({ title: 'OrderPreviewLine' })

export const orderPreviewSchema = z.object({
  lines: z.array(orderPreviewLineSchema),
  itemsTotal: z.number(),
  discount: z.number(),
  promoCodeMessage: z.string().nullable(),
  deliveryFee: z.number(),
  /** Real fee when a free-delivery promotion pays it instead of the buyer. */
  sponsoredDeliveryFee: z.number(),
  deliverySponsor: z.enum(['SUPPLIER', 'PLATFORM']).nullable(),
  deliveryReason: z.string(),
  deliveryDistanceKm: z.number().nullable(),
  total: z.number(),
}).meta({
  title: 'OrderPreview',
  description: 'Server-computed basket totals',
})

export type PreviewOrder = z.infer<typeof previewOrderSchema>
export type OrderPreview = z.infer<typeof orderPreviewSchema>
export type UpdateOrderStatus = z.infer<typeof updateOrderStatusSchema>
export type RejectOrder = z.infer<typeof rejectOrderSchema>
export type CreateDispute = z.infer<typeof createDisputeSchema>
export type OrderItemInput = z.infer<typeof orderItemInputSchema>
export type OrderResponse = z.infer<typeof orderResponseSchema>
export type OrderDeliverySummary = z.infer<typeof orderDeliverySummarySchema>
export type DisputeResponse = z.infer<typeof disputeResponseSchema>
