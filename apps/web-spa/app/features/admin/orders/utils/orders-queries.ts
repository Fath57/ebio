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
  /** CASH_ON_DELIVERY | FEDAPAY | WALLET (null on legacy rows). */
  paymentMethod: string | null
  totalAmount: number
  commissionAmount: number
  createdAt: string
  buyer: AdminOrderParty
  supplier: AdminOrderParty
}

export interface AdminOrderLine {
  id: string
  productName: string
  /** First product photo, and its thumbnail when the optimised variant exists. */
  productPhoto: string | null
  productThumbnail: string | null
  quantity: number
  unitPrice: number
  totalPrice: number
  /** Free unit(s) of a "buy X get Y" promotion: shown at 0. */
  isGift: boolean
}

/** Latest courier run of the order (null for on-site pickup). */
export interface AdminOrderDeliverySummary {
  id: string
  status: string
  courierId: string | null
  courierName: string | null
  updatedAt: string | null
}

export interface AdminOrderDetail extends AdminOrderListItem {
  delivery: AdminOrderDeliverySummary | null
  commissionRate: number
  deliveryAddress: string | null
  deliverySlot: string | null
  acceptedAt: string | null
  deliveredAt: string | null
  /** Shop estimate of when the parcel is ready, set when preparation starts. */
  estimatedReadyAt: string | null
  buyerEmail: string | null
  buyerPhone: string | null
  /** Who paid the delivery on the buyer's behalf (null = the buyer did). */
  deliverySponsor: 'SUPPLIER' | 'PLATFORM' | null
  sponsoredDeliveryFee: number
  /** What eBio owes the shop for its platform-funded promotions. */
  platformPromoCompensation: number
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
  'PENDING_PAYMENT',
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
