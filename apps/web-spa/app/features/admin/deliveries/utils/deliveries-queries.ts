import {
  adminCouriersControllerAssignDelivery,
  adminCouriersControllerGetDelivery,
  adminCouriersControllerListCandidates,
  adminCouriersControllerListDeliveries,
  adminCouriersControllerRebroadcastDelivery,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export type DeliveryStatus = 'AWAITING_COURIER' | 'ACCEPTED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'CANCELLED'
export type VehicleType = 'MOTO' | 'BICYCLE' | 'CAR' | 'ON_FOOT'

export const DELIVERY_STATUSES: DeliveryStatus[] = [
  'AWAITING_COURIER',
  'ACCEPTED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
]

/** Statuses in which the back office may still choose the courier. */
export const ASSIGNABLE_STATUSES: DeliveryStatus[] = ['AWAITING_COURIER', 'ACCEPTED']

export interface GeoPoint {
  latitude: number
  longitude: number
}

export interface DeliveryEvent {
  type: string
  occurredAt: string
  payload: Record<string, unknown> | null
}

export interface BuyerRating {
  rating: number
  comment: string | null
  createdAt: string
}

export interface AdminDelivery {
  id: string
  orderId: string
  orderNumber: string
  status: DeliveryStatus
  pickupAddress: string
  dropoffAddress: string
  supplierShopName: string
  buyerContact: { name: string, phone: string | null } | null
  courier: { name: string, phone: string, ratingAvg: number | null, ratingCount: number } | null
  courierVehicleType: VehicleType | null
  courierPosition: (GeoPoint & { updatedAt: string }) | null
  pickupPosition: GeoPoint | null
  dropoffPosition: GeoPoint | null
  itemsCount: number
  totalAmount: number
  paymentMethod: string
  deliveryFee: number
  courierFee: number
  /** Buyer tip in FCFA, 0 when none. */
  tipAmount: number
  /** Buyer rating of the courier, null until rated (or not exposed). */
  buyerRating: BuyerRating | null
  acceptedAt: string | null
  pickedUpAt: string | null
  deliveredAt: string | null
  failedAt: string | null
  events: DeliveryEvent[]
  createdAt: string
}

export interface AdminDeliveryDetail extends AdminDelivery {
  courierId: string | null
  reassignmentCount: number
  offeredAt: string
}

export interface AdminDeliveriesData {
  deliveries: AdminDelivery[]
  total: number
}

export interface CourierCandidate {
  id: string
  fullName: string
  phone: string
  vehicleType: VehicleType
  zone: string
  isAvailable: boolean
  positionSource: 'GPS' | 'ZONE' | null
  position: GeoPoint | null
  lastLocationAt: string | null
  distanceKm: number | null
  activeDeliveries: number
  deliveredCount: number
  ratingAvg: number | null
  ratingCount: number
  isCurrent: boolean
}

export interface CandidateFilters {
  q?: string
  radiusKm?: number
  availableOnly?: boolean
  vehicleType?: VehicleType
}

export const DELIVERIES_PAGE_SIZE = 20

export function fetchAdminDeliveriesQueryOptions(params: { status?: string, page?: number }) {
  return {
    queryKey: ['admin', 'deliveries', params.status ?? 'ALL', params.page ?? 1],
    queryFn: async () => {
      // Generated query params are all required strings; the API ignores empty ones.
      const response = await adminCouriersControllerListDeliveries({
        query: {
          status: params.status ?? '',
          courierId: '',
          page: String(params.page ?? 1),
          limit: String(DELIVERIES_PAGE_SIZE),
        },
      })
      if (response.error)
        throw new Error('Failed to fetch deliveries')
      return response.data as unknown as AdminDeliveriesData
    },
  }
}

export function fetchAdminDeliveryQueryOptions(deliveryId: string) {
  return {
    queryKey: ['admin', 'deliveries', 'detail', deliveryId],
    queryFn: async () => {
      const response = await adminCouriersControllerGetDelivery({ path: { id: deliveryId } })
      if (response.error)
        throw new Error('Failed to fetch delivery')
      return response.data as unknown as AdminDeliveryDetail
    },
  }
}

export function fetchCandidatesQueryOptions(deliveryId: string, filters: CandidateFilters) {
  return {
    queryKey: ['admin', 'deliveries', deliveryId, 'candidates', filters],
    queryFn: async () => {
      const response = await adminCouriersControllerListCandidates({
        path: { id: deliveryId },
        query: {
          q: filters.q ?? '',
          radiusKm: filters.radiusKm ? String(filters.radiusKm) : '',
          availableOnly: filters.availableOnly ? 'true' : '',
          vehicleType: filters.vehicleType ?? '',
        },
      })
      if (response.error)
        throw new Error('Failed to fetch candidates')
      return response.data as unknown as CourierCandidate[]
    },
  }
}

export const assignDeliveryMutationOptions = {
  mutationFn: async ({ deliveryId, courierId, note }: { deliveryId: string, courierId: string, note?: string }) => {
    const response = await adminCouriersControllerAssignDelivery({
      path: { id: deliveryId },
      body: { courierId, ...(note ? { note } : {}) },
    })
    if (response.error) {
      const message = (response.error as { message?: string }).message
      throw new Error(message ?? 'Failed to assign delivery')
    }
    return response.data as unknown as AdminDelivery
  },
}

export const rebroadcastDeliveryMutationOptions = {
  mutationFn: async (deliveryId: string) => {
    const response = await adminCouriersControllerRebroadcastDelivery({ path: { id: deliveryId } })
    if (response.error)
      throw new Error('Failed to rebroadcast delivery')
    return response.data as unknown as AdminDelivery
  },
}

/** "il y a 3 min" style label, in the UI language. */
export function formatRelative(iso: string | null, locale: string): string | null {
  if (!iso)
    return null
  const diffMs = new Date(iso).getTime() - Date.now()
  const abs = Math.abs(diffMs)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const minutes = Math.round(diffMs / 60_000)
  if (abs < 60 * 60_000)
    return rtf.format(minutes, 'minute')
  const hours = Math.round(diffMs / 3_600_000)
  if (abs < 24 * 3_600_000)
    return rtf.format(hours, 'hour')
  return rtf.format(Math.round(diffMs / 86_400_000), 'day')
}

/** "14 min" / "2 h 05" elapsed since an ISO date. */
export function formatElapsed(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (minutes < 60)
    return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${hours} h ${String(rest).padStart(2, '0')}`
}
