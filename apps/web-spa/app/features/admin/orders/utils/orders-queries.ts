import { client } from '@boilerstone/openapi-generator'
import {
  adminControllerGetOrderById,
  adminControllerGetOrders,
  adminControllerUpdateOrderDeliveryWindow,
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
  /** Window the courier search follows, ISO; null = as soon as ready. */
  deliveryWindowStart: string | null
  deliveryWindowEnd: string | null
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
  /** Orders per status under the other filters, for the tabs. */
  statusCounts: Record<string, number>
}

/** Filters beyond status and search; each maps to one query parameter of `GET /admin/orders`. */
export interface AdminOrderFilterValues {
  supplierId?: string
  paymentMethod?: string
  pickupMode?: string
  /** `YYYY-MM-DD`, both days included. */
  from?: string
  to?: string
  minAmount?: string
  maxAmount?: string
  promo?: string
  sponsor?: string
  courier?: string
}

export interface AdminOrdersFilters extends AdminOrderFilterValues {
  status?: string
  q?: string
  sortBy?: string
  sortDir?: string
  page?: number
}

/** Every list parameter but the page, '' when unset. */
function orderListQuery(filters: AdminOrdersFilters) {
  return {
    status: filters.status ?? '',
    supplierId: filters.supplierId ?? '',
    q: filters.q ?? '',
    paymentMethod: filters.paymentMethod ?? '',
    pickupMode: filters.pickupMode ?? '',
    from: filters.from ?? '',
    to: filters.to ?? '',
    minAmount: filters.minAmount ?? '',
    maxAmount: filters.maxAmount ?? '',
    promo: filters.promo ?? '',
    sponsor: filters.sponsor ?? '',
    courier: filters.courier ?? '',
    sortBy: filters.sortBy ?? '',
    sortDir: filters.sortDir ?? '',
  }
}

/** Same filters, status and sort as the list, as a CSV: what is on screen, without the pages. */
export function adminOrdersExportPath(filters: AdminOrdersFilters): string {
  const params = new URLSearchParams({ format: 'csv' })
  for (const [key, value] of Object.entries(orderListQuery(filters))) {
    if (value)
      params.set(key, value)
  }
  return `/api/admin/orders?${params.toString()}`
}

/** Le SDK généré exige toutes les clés de query : un filtre vide vaut ''. */
export function fetchAdminOrdersQueryOptions(filters: AdminOrdersFilters = {}) {
  return {
    queryKey: ['admin', 'orders', filters],
    queryFn: async () => {
      const response = await adminControllerGetOrders({
        query: {
          ...orderListQuery(filters),
          format: 'json',
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

export interface AdminDeliveryWindowInput {
  start: string | null
  end: string | null
  slotText?: string
  reason?: string
}

/** The API's message is French and precise (« Ce créneau est déjà passé »): pass it through. */
export async function updateAdminOrderDeliveryWindow(orderId: string, body: AdminDeliveryWindowInput): Promise<void> {
  const response = await adminControllerUpdateOrderDeliveryWindow({
    path: { id: orderId },
    body: {
      ...body,
      start: body.start ? new Date(body.start) : null,
      end: body.end ? new Date(body.end) : null,
    },
  })
  if (response.error) {
    const message = (response.error as { message?: unknown }).message
    throw new Error(typeof message === 'string' ? message : 'Failed to update delivery window')
  }
}
