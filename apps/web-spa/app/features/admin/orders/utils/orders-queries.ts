import { client } from '@boilerstone/openapi-generator'
import {
  adminControllerGetOrderById,
  adminControllerGetOrders,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export interface AdminOrderParty {
  id: string | null
  name?: string
  shopName?: string
}

export interface AdminOrderListItem {
  id: string
  orderNumber: string
  status: string
  pickupMode: string
  totalAmount: number
  commissionAmount: number
  createdAt: string
  buyer: AdminOrderParty
  supplier: AdminOrderParty
}

export interface AdminOrderLine {
  id: string
  productName: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

export interface AdminOrderDetail extends AdminOrderListItem {
  commissionRate: number
  paymentMethod: string
  deliveryAddress: string | null
  deliverySlot: string | null
  acceptedAt: string | null
  deliveredAt: string | null
  buyerEmail: string | null
  buyerPhone: string | null
  items: AdminOrderLine[]
}

export interface AdminOrdersPage {
  items: AdminOrderListItem[]
  total: number
  page: number
  limit: number
}

export interface AdminOrdersFilters {
  status?: string
  supplierId?: string
  q?: string
  sortBy?: string
  sortDir?: string
  page?: number
}

/** Le SDK généré exige toutes les clés de query : un filtre vide vaut ''. */
export function fetchAdminOrdersQueryOptions(filters: AdminOrdersFilters = {}) {
  return {
    queryKey: ['admin', 'orders', filters],
    queryFn: async () => {
      const response = await adminControllerGetOrders({
        query: {
          status: filters.status ?? '',
          supplierId: filters.supplierId ?? '',
          q: filters.q ?? '',
          sortBy: filters.sortBy ?? '',
          sortDir: filters.sortDir ?? '',
          page: String(filters.page ?? 1),
          limit: '20',
        },
      })
      if (response.error)
        throw new Error('Failed to fetch orders')
      return response.data as AdminOrdersPage
    },
  }
}

export function fetchAdminOrderQueryOptions(orderId: string) {
  return {
    queryKey: ['admin', 'orders', orderId],
    queryFn: async () => {
      const response = await adminControllerGetOrderById({ path: { id: orderId } })
      if (response.error)
        throw new Error('Failed to fetch order')
      return response.data as AdminOrderDetail
    },
  }
}

/** Every status an admin can force on an order. */
export const ADMIN_ORDER_STATUSES = [
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'IN_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'DISPUTED',
] as const

export async function updateAdminOrderStatus(orderId: string, status: string): Promise<void> {
  const response = await client.patch({
    url: '/api/admin/orders/{id}/status',
    path: { id: orderId },
    body: { status },
  })
  if (response.error)
    throw new Error('Failed to update order status')
}
