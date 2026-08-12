import {
  ordersControllerAccept,
  ordersControllerFindAll,
  ordersControllerFindById,
  ordersControllerReject,
  ordersControllerUpdateStatus,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export const ORDER_STATUSES = [
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'IN_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'DISPUTED',
] as const

export type OrderStatus = typeof ORDER_STATUSES[number]

export interface OrderItem {
  id: string
  productId: string
  productName: string
  productPhoto: string | null
  variantId: string | null
  variantLabel: string | null
  quantity: number
  unitPrice: number
  totalPrice: number
}

export interface OrderResponse {
  id: string
  orderNumber: string
  buyerId: string
  buyerName: string
  supplierId: string
  supplierName: string
  status: OrderStatus
  pickupMode: 'ON_SITE' | 'DELIVERY'
  paymentMethod: 'FEDAPAY' | 'CASH_ON_DELIVERY'
  deliveryAddress: string | null
  deliverySlot: string | null
  totalAmount: number
  commissionRate: number
  commissionAmount: number
  deliveryConfirmedByBuyer: boolean
  deliveryConfirmedBySupplier: boolean
  acceptedAt: string | null
  deliveredAt: string | null
  escrowReleasedAt: string | null
  items: OrderItem[]
  createdAt: string
  updatedAt: string
}

export const statusVariantMap: Record<OrderStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PLACED: 'outline',
  ACCEPTED: 'default',
  PREPARING: 'secondary',
  READY: 'default',
  IN_DELIVERY: 'secondary',
  DELIVERED: 'default',
  CANCELLED: 'destructive',
  DISPUTED: 'destructive',
}

export interface OrdersData {
  orders: OrderResponse[]
  total: number
}

export function fetchOrdersQueryOptions(status?: string) {
  return {
    queryKey: ['orders', status],
    queryFn: async () => {
      const response = await ordersControllerFindAll({
        query: { status: status ?? '', page: '1', limit: '50', view: '' },
      })
      if (response.error)
        throw new Error('Failed to fetch orders')
      return response.data as OrdersData
    },
  }
}

export function fetchOrderDetailQueryOptions(orderId: string) {
  return {
    queryKey: ['orders', orderId],
    queryFn: async () => {
      const response = await ordersControllerFindById({
        path: { id: orderId },
      })
      if (response.error)
        throw new Error('Failed to fetch order')
      return response.data as OrderResponse
    },
  }
}

export const acceptOrderMutationOptions = {
  mutationFn: async (orderId: string) => {
    const response = await ordersControllerAccept({
      path: { id: orderId },
    })
    if (response.error)
      throw new Error('Failed to accept order')
    return response.data
  },
}

export const rejectOrderMutationOptions = {
  mutationFn: async ({ orderId, reason }: { orderId: string, reason: string }) => {
    const response = await ordersControllerReject({
      path: { id: orderId },
      body: { reason },
    })
    if (response.error)
      throw new Error('Failed to reject order')
    return response.data
  },
}

export const updateOrderStatusMutationOptions = {
  mutationFn: async ({ orderId, status }: { orderId: string, status: 'PREPARING' | 'READY' | 'IN_DELIVERY' }) => {
    const response = await ordersControllerUpdateStatus({
      path: { id: orderId },
      body: { status },
    })
    if (response.error)
      throw new Error('Failed to update order status')
    return response.data
  },
}
