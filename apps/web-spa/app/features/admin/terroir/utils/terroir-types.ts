/**
 * Shapes of the terroir back-office routes (011, `terroir.contract.ts`). The
 * generated SDK types every response as `unknown`: these mirror the API
 * contract, and the queries coerce every amount through Number().
 */

/** ISO 3166-1 alpha-2 code of a destination country; the list lives in the API (`GET /admin/export/countries`). */
export type ExportCountryCode = string

export const EXPORT_COUNTRY_CURRENCIES = ['EUR', 'USD', 'CAD'] as const
export type ExportCountryCurrency = typeof EXPORT_COUNTRY_CURRENCIES[number]

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

/**
 * Computed from the export criteria on every save, no manual review:
 * WITHDRAWN is eBio's decision and stands until eBio reinstates.
 */
export const EXPORT_PROFILE_STATUSES = ['EXPORTABLE', 'INCOMPLETE', 'WITHDRAWN'] as const
export type ExportProfileStatus = typeof EXPORT_PROFILE_STATUSES[number]
/** RETIRED: withdrawn by its own author, kept for the orders that quote it. */
export const EXPORT_PACK_STATUSES = [...EXPORT_PROFILE_STATUSES, 'RETIRED'] as const
export type ExportPackStatus = typeof EXPORT_PACK_STATUSES[number]
export type ExportSupplementStatus = 'NONE' | 'REQUESTED' | 'PAID' | 'WAIVED' | 'ITEM_REMOVED'
export type ExportStorage = 'AMBIENT' | 'COOL' | 'FROZEN'

/** One export criterion, met or not, worded by the API with today's thresholds. */
export interface ExportCriterion {
  key: string
  label: string
  met: boolean
  /** What the shop must do to meet it. */
  hint: string
}

// ===== DESTINATION COUNTRIES =====

export interface ExportCountryCounts {
  pickupPoints: number
  openDepartures: number
  activeShipments: number
}

export interface ExportCountryAdmin {
  code: ExportCountryCode
  name: string
  toPhrase: string
  inPhrase: string
  displayCurrency: ExportCountryCurrency
  flagEmoji: string | null
  sortOrder: number
  isActive: boolean
  counts: ExportCountryCounts
  createdAt: string
  updatedAt: string
}

export interface ExportCountryUpdate {
  name?: string
  toPhrase?: string
  inPhrase?: string
  displayCurrency?: ExportCountryCurrency
  flagEmoji?: string | null
  sortOrder?: number
  isActive?: boolean
}

export interface ExportCountryInput extends ExportCountryUpdate {
  code: ExportCountryCode
  name: string
  toPhrase: string
  inPhrase: string
  displayCurrency: ExportCountryCurrency
}

// ===== AGENCIES =====

export interface ExportPickupPoint {
  id: string
  agencyId: string
  country: ExportCountryCode
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
  country: ExportCountryCode
  city: string
  address: string
  openingHours: string | null
  active: boolean
}

// ===== DEPARTURES =====

export interface ExportDepartureRate {
  country: ExportCountryCode
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
  country: ExportCountryCode
  status: ExportShipmentStatus
  estimatedWeightG: number
  actualWeightG: number | null
  insured: boolean
}

export interface ExportCollectionLine {
  shipmentId: string
  orderId: string
  orderItemId: string
  orderNumber: string
  name: string
  quantity: number
  imageUrl: string | null
}

export type ExportCollectionMode = 'COURIER' | 'EBIO'

/** How a shop's orders reach the eBio hub: a courier run or eBio's own staff. */
export interface ExportShopCollection {
  mode: ExportCollectionMode
  /** The courier run, for the « received at the hub » action; null in EBIO mode. */
  deliveryId: string | null
  /** AWAITING_COURIER, ACCEPTED, PICKED_UP, IN_TRANSIT, DELIVERED, FAILED, CANCELLED. */
  status: string | null
  courierName: string | null
  courierPhone: string | null
  /** The code the hub staff give the courier once the parcel is in their hands. */
  hubCode: string | null
  pickedUpAt: string | null
  receivedAt: string | null
}

export interface ExportCollectionShop {
  supplierId: string
  shopName: string
  lines: ExportCollectionLine[]
  collected: boolean
  /** Null while a courier will be sent once the shop has prepared. */
  collection: ExportShopCollection | null
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
  country: ExportCountryCode
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

// ===== EXPORT WATCH AND PACKS =====

export interface ExportOrigin {
  producer: string | null
  place: string | null
  year: number | null
  method: string | null
  photos: string[]
}

/** A product offered for export, as eBio watches it (`GET /admin/export/products`). */
export interface AdminExportProduct {
  productId: string
  status: ExportProfileStatus
  criteria: ExportCriterion[]
  missingCount: number
  withdrawnReason: string | null
  withdrawnAt: string | null
  packedWeightG: number | null
  lengthCm: number | null
  widthCm: number | null
  heightCm: number | null
  shelfLifeDays: number | null
  storage: ExportStorage | null
  allergens: string | null
  noAllergens: boolean
  origin: ExportOrigin
  labelPhoto: string | null
  declaresFrenchLabel: boolean
  declaresDatesPrinted: boolean
  declaresSealedPackaging: boolean
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

export interface AdminExportProductsPage {
  data: AdminExportProduct[]
  total: number
  page: number
  pageSize: number
  /** Count by status over the whole catalogue, search ignored. */
  counts: Record<ExportProfileStatus, number>
}

export interface AdminExportProductsFilter {
  status: ExportProfileStatus
  search: string
  page: number
}

/** `ebio`: eBio's own packs; `all`: the shops' packs too. */
export type ExportPackScope = 'ebio' | 'all'

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
  criteria: ExportCriterion[]
  missingCount: number
  withdrawnReason: string | null
  withdrawnAt: string | null
  items: ExportPackItem[]
  linesTotal: number
  difference: number
  orderable: boolean
  createdAt: string
}

export interface ExportPackInput {
  name: string
  description: string | null
  photos: string[]
  price: number
  items: Array<{ productId: string, variantId: string | null, quantity: number }>
}
