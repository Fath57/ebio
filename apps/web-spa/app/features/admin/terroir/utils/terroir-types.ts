/**
 * Shapes of the terroir back-office routes (011, `terroir.contract.ts`). The
 * generated SDK types every response as `unknown`: these mirror the API
 * contract, and the queries coerce every amount through Number().
 */

export const EXPORT_COUNTRIES = ['FR', 'BE'] as const
export type ExportCountry = typeof EXPORT_COUNTRIES[number]

export const DEPARTURE_STATUSES = ['OPEN', 'FULL', 'CANCELLED', 'DEPARTED'] as const
export type ExportDepartureStatus = typeof DEPARTURE_STATUSES[number]

export const SHIPMENT_STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'COLLECTING',
  'PACKED',
  'DROPPED_AT_AGENCY',
  'DEPARTED',
  'ARRIVED',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'HANDED_OVER',
  'LOST',
  'DAMAGED',
  'CANCELLED',
] as const
export type ExportShipmentStatus = typeof SHIPMENT_STATUSES[number]

/** Steps the staff publish by hand; payment, settlement and loss have their own routes. */
export const PUBLISHABLE_STEPS: readonly ExportShipmentStatus[] = [
  'DROPPED_AT_AGENCY',
  'DEPARTED',
  'ARRIVED',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
]

export type ExportProfileStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type ExportPackStatus = ExportProfileStatus | 'RETIRED'
export type ExportSupplementStatus = 'NONE' | 'REQUESTED' | 'PAID' | 'WAIVED' | 'ITEM_REMOVED'

/** The export checklist (data-model §7): every key ticked before approval. */
export const EXPORT_CHECKLIST_KEYS = [
  'label_french',
  'allergens_declared',
  'dates_present',
  'shelf_life_sufficient',
  'ingredients_allowed',
  'label_photo',
] as const
export type ExportChecklistKey = typeof EXPORT_CHECKLIST_KEYS[number]

// ===== AGENCIES =====

export interface ExportPickupPoint {
  id: string
  agencyId: string
  country: ExportCountry
  city: string
  address: string
  openingHours: string | null
  active: boolean
}

export interface ExportAgency {
  id: string
  name: string
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  notes: string | null
  active: boolean
  pickupPoints: ExportPickupPoint[]
  createdAt: string
}

export interface ExportAgencyInput {
  name: string
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  notes: string | null
  active: boolean
}

export interface ExportPickupPointInput {
  country: ExportCountry
  city: string
  address: string
  openingHours: string | null
  active: boolean
}

// ===== DEPARTURES =====

export interface ExportDepartureRate {
  country: ExportCountry
  pricePerKg: number
  minBilledKg: number
  maxWeightKg: number | null
  homeDeliveryFee: number | null
}

export interface ExportFill {
  reservedKg: number
  capacityKg: number | null
  ratio: number | null
}

export interface ExportDeparture {
  id: string
  agency: { id: string, name: string }
  departsOn: string
  depositDeadline: string
  orderBefore: string
  transitMinDays: number
  transitMaxDays: number
  arrival: { from: string, to: string }
  status: ExportDepartureStatus
  rates: ExportDepartureRate[]
  fill: ExportFill
  shipmentCount: number
  createdAt: string
}

export interface ExportDepartureShipmentRow {
  id: string
  buyer: string
  country: ExportCountry
  status: ExportShipmentStatus
  estimatedWeightG: number
  actualWeightG: number | null
  insured: boolean
}

export interface ExportCollectionLine {
  shipmentId: string
  orderId: string
  orderItemId: string
  name: string
  quantity: number
  imageUrl: string | null
}

export interface ExportCollectionShop {
  supplierId: string
  shopName: string
  lines: ExportCollectionLine[]
  collected: boolean
}

export interface ExportDepartureDetail extends ExportDeparture {
  shipments: ExportDepartureShipmentRow[]
  collection: ExportCollectionShop[]
}

export interface ExportDepartureInput {
  agencyId: string
  departsOn: string
  depositDeadline: string
  transitMinDays: number
  transitMaxDays: number
  capacityKg: number | null
  rates: ExportDepartureRate[]
}

export interface CancelDepartureResult {
  departure: ExportDeparture
  reassigned: number
  surcharge: number
}

// ===== PARCELS =====

export interface ExportAdminShipmentLine {
  id: string
  name: string
  quantity: number
  totalPrice: number
  imageUrl: string | null
  removed: boolean
}

export interface ExportAdminShipmentOrder {
  id: string
  orderNumber: string
  supplierId: string
  shopName: string
  status: string
  collected: boolean
  totalAmount: number
  lines: ExportAdminShipmentLine[]
}

export interface ExportShipmentEvent {
  id: string
  step: ExportShipmentStatus | null
  message: string | null
  pickupPoint: string | null
  author: string | null
  at: string
}

export interface ExportContact {
  name: string
  email: string | null
  phone: string | null
}

export interface ExportAdminShipment {
  id: string
  status: ExportShipmentStatus
  country: ExportCountry
  buyer: ExportContact & { id: string }
  gift: (ExportContact & { message: string | null }) | null
  departure: { id: string, agency: string, departsOn: string, status: ExportDepartureStatus, depositDeadline: string }
  reception: 'PICKUP' | 'HOME'
  pickupPoint: { id: string, city: string, address: string, openingHours: string | null } | null
  homeAddress: string | null
  estimatedWeightG: number
  actualWeightG: number | null
  shippingPrice: number
  homeDeliveryFee: number
  insured: boolean
  insurancePrice: number
  declaredValue: number
  supplement: {
    status: ExportSupplementStatus
    amount: number | null
    requestedAt: string | null
    deadline: string | null
  }
  orders: ExportAdminShipmentOrder[]
  events: ExportShipmentEvent[]
  trackingToken: string
  createdAt: string
}

export interface ExportShipmentEventInput {
  step?: ExportShipmentStatus | null
  message?: string | null
  pickupPoint?: string | null
}

// ===== REVIEWS AND PACKS =====

export interface ExportOrigin {
  producer: string | null
  place: string | null
  year: number | null
  method: string | null
  photos: string[]
}

export interface ExportReviewProduct {
  productId: string
  status: ExportProfileStatus
  packedWeightG: number
  lengthCm: number | null
  widthCm: number | null
  heightCm: number | null
  shelfLifeDays: number
  origin: ExportOrigin
  labelPhoto: string | null
  checklist: Record<string, boolean>
  rejectionReason: string | null
  reviewedAt: string | null
  badge: boolean
  updatedAt: string
  productName: string
  imageUrl: string | null
  supplierId: string
  shopName: string
  categoryName: string
  composition: {
    ingredients: string | null
    allergens: string[]
    conservation: string | null
  }
}

export interface ExportPackItem {
  productId: string
  variantId: string | null
  quantity: number
  name: string
  imageUrl: string | null
  supplierId: string
  shopName: string
  unitPrice: number
  exportStatus: ExportProfileStatus | null
}

export interface ExportPack {
  id: string
  supplierId: string | null
  shopName: string | null
  name: string
  description: string | null
  photos: string[]
  price: number
  status: ExportPackStatus
  rejectionReason: string | null
  reviewedAt: string | null
  items: ExportPackItem[]
  linesTotal: number
  difference: number
  orderable: boolean
  createdAt: string
}

export interface ExportReviews {
  products: ExportReviewProduct[]
  packs: ExportPack[]
}

export interface ExportPackInput {
  name: string
  description: string | null
  photos: string[]
  price: number
  items: Array<{ productId: string, variantId: string | null, quantity: number }>
}

export type ExportReviewDecision = 'APPROVE' | 'REJECT'
