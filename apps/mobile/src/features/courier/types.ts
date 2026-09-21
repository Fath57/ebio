export type CourierValidationStatus = 'PENDING' | 'VALIDATED' | 'REJECTED' | 'COMPLEMENT_REQUESTED' | 'SUSPENDED'

export type VehicleType = 'MOTO' | 'BICYCLE' | 'CAR' | 'ON_FOOT'

export type DeliveryStatus = 'AWAITING_COURIER' | 'ACCEPTED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'CANCELLED'

export type DeliveryFailReason = 'CUSTOMER_ABSENT' | 'ADDRESS_NOT_FOUND' | 'CUSTOMER_REFUSED' | 'OTHER'

/** Why the platform withholds runs from the courier, null when dispatch is open. */
export interface CourierDispatchBlock {
  reason: 'DEBT'
  /** Wallet balance in FCFA, negative while in debt. */
  balance: number
  /** Maximum debt the platform tolerates, in FCFA (positive). */
  limit: number
}

export interface CourierProfile {
  id: string
  userId: string
  fullName: string
  phone: string
  vehicleType: VehicleType
  zone: string
  zoneLatitude: number | null
  zoneLongitude: number | null
  zoneRadiusKm: number | null
  identityDocument: string | null
  validationStatus: CourierValidationStatus
  rejectionReason: string | null
  isAvailable: boolean
  /** Average of the buyers' ratings, null until the first one. */
  ratingAvg: number | null
  ratingCount: number
  /** Set while the platform stops proposing runs (wallet debt past the limit). */
  dispatchBlock: CourierDispatchBlock | null
  validatedAt: string | null
  createdAt: string
}

export interface DeliveryOffer {
  id: string
  orderNumber: string
  pickupAddress: string
  dropoffAddress: string
  distanceKm: number | null
  /** Shop → pinned drop-off point; null when the buyer gave no GPS point. */
  routeKm: number | null
  dropoffPosition: { latitude: number, longitude: number } | null
  supplierShopName: string
  itemsCount: number
  totalAmount: number
  /** What the buyer paid for delivery. */
  deliveryFee: number
  /** The courier's net earning once eBio's commission is taken. */
  courierFee: number
  paymentMethod: string
  /** Cash orders: what to collect from the buyer at the door, null otherwise. */
  cashToCollect: number | null
  /** Cash orders: what the courier hands the shop at pickup, null otherwise. */
  cashToShop: number | null
  offeredAt: string
  /** True while the run is offered to this courier alone (sequential dispatch). */
  isTargeted: boolean
  /** End of the exclusive window (ISO), null on broadcast offers. */
  expiresAt: string | null
  /** When the shop expects the parcel to be ready (early dispatch), null when unknown. */
  pickupReadyAt: string | null
}

export interface DeliveryContact {
  name: string
  phone: string | null
}

export interface BuyerRating {
  rating: number
  comment: string | null
  createdAt: string
}

export interface DeliveryEventDto {
  type: string
  occurredAt: string
  payload: Record<string, unknown> | null
}

export interface Delivery {
  id: string
  orderId: string
  orderNumber: string
  status: DeliveryStatus
  pickupAddress: string
  dropoffAddress: string
  supplierShopName: string
  buyerContact: DeliveryContact | null
  courier: DeliveryContact | null
  courierVehicleType: VehicleType | null
  courierPosition: { latitude: number, longitude: number, updatedAt: string | null } | null
  pickupPosition: { latitude: number, longitude: number } | null
  dropoffPosition: { latitude: number, longitude: number } | null
  confirmationCode: string | null
  proofType: 'CODE' | 'PHOTO' | null
  failReason: DeliveryFailReason | null
  failComment: string | null
  itemsCount: number
  totalAmount: number
  /** What the buyer paid for delivery. */
  deliveryFee: number
  /** The courier's net earning once eBio's commission is taken. */
  courierFee: number
  paymentMethod: string
  /** Cash orders: what to collect from the buyer at the door, null otherwise. */
  cashToCollect: number | null
  /** Cash orders: what the courier hands the shop at pickup, null otherwise. */
  cashToShop: number | null
  /** When the shop expects the parcel to be ready (early dispatch), null when unknown. */
  pickupReadyAt: string | null
  /** When the courier search is scheduled to start (10 min before `pickupReadyAt`). */
  dispatchAt: string | null
  /** When the courier search actually started. */
  dispatchStartedAt: string | null
  acceptedAt: string | null
  pickedUpAt: string | null
  inTransitAt: string | null
  deliveredAt: string | null
  failedAt: string | null
  events: DeliveryEventDto[]
  /** Rating left by the buyer once delivered, null otherwise. */
  buyerRating?: BuyerRating | null
  /** Tip received from the buyer, in FCFA (0 when none). */
  tipAmount?: number
  createdAt: string
}

export const VEHICLE_LABELS: Record<VehicleType, string> = {
  MOTO: 'Moto',
  BICYCLE: 'Vélo',
  CAR: 'Voiture',
  ON_FOOT: 'À pied',
}

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  AWAITING_COURIER: 'En attente de livreur',
  ACCEPTED: 'Acceptée',
  PICKED_UP: 'Récupérée',
  IN_TRANSIT: 'En livraison',
  DELIVERED: 'Livrée',
  FAILED: 'Échec',
  CANCELLED: 'Annulée',
}

export const FAIL_REASON_LABELS: Record<DeliveryFailReason, string> = {
  CUSTOMER_ABSENT: 'Client absent',
  ADDRESS_NOT_FOUND: 'Adresse introuvable',
  CUSTOMER_REFUSED: 'Refus du client',
  OTHER: 'Autre motif',
}

/**
 * An offered run: several shops to collect from, one handover, one
 * earning. The courier takes it or leaves it whole — they cannot pick
 * half of it, or the single fee promised to the buyer would no longer
 * cover the ride.
 */
export interface RunStop {
  deliveryId: string
  shopName: string
  pickupAddress: string
  orderNumber: string
}

export interface RunOffer {
  id: string
  shopCount: number
  /** The courier's net earning for the whole run. */
  courierFee: number
  /** What the buyer paid for delivery. */
  deliveryFee: number
  dropoffAddress: string
  dropoffPosition: { latitude: number, longitude: number } | null
  /** Distance from the courier to the first pickup; null without a known position. */
  distanceKm: number | null
  /** Distance of the whole run, pickups included. */
  routeKm: number | null
  paymentMethod: string
  totalAmount: number
  cashToCollect: number | null
  cashToShop: number | null
  /** The pickups, in visiting order. */
  stops: RunStop[]
  isTargeted: boolean
  expiresAt: string | null
  offeredAt: string
}

/** One offer, lone delivery or run, in a single feed. */
export type CourierOffer
  = | ({ kind: 'DELIVERY' } & DeliveryOffer)
    | ({ kind: 'RUN' } & RunOffer)

/** One pickup of the current run, with its progress. */
export interface ActiveRunStop {
  deliveryId: string
  orderId: string
  orderNumber: string
  shopName: string
  pickupAddress: string
  pickupPosition: { latitude: number, longitude: number } | null
  status: DeliveryStatus
  itemsCount: number
}

export type RunStatus = 'AWAITING_COURIER' | 'ESCALATED' | 'BUYER_DECISION' | 'ACCEPTED' | 'COLLECTING' | 'DELIVERING' | 'DELIVERED' | 'CANCELLED'

export interface ActiveRun {
  id: string
  status: RunStatus
  shopCount: number
  courierFee: number
  deliveryFee: number
  routeKm: number | null
  /** Handover code, drawn at the first pickup; null before that. */
  confirmationCode: string | null
  dropoffAddress: string
  dropoffPosition: { latitude: number, longitude: number } | null
  paymentMethod: string
  totalAmount: number
  cashToCollect: number | null
  cashToShop: number | null
  stops: ActiveRunStop[]
}
