export type CourierValidationStatus = 'PENDING' | 'VALIDATED' | 'REJECTED' | 'COMPLEMENT_REQUESTED' | 'SUSPENDED'

export type VehicleType = 'MOTO' | 'BICYCLE' | 'CAR' | 'ON_FOOT'

export type DeliveryStatus = 'AWAITING_COURIER' | 'ACCEPTED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'CANCELLED'

export type DeliveryFailReason = 'CUSTOMER_ABSENT' | 'ADDRESS_NOT_FOUND' | 'CUSTOMER_REFUSED' | 'OTHER'

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
  offeredAt: string
}

export interface DeliveryContact {
  name: string
  phone: string | null
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
  acceptedAt: string | null
  pickedUpAt: string | null
  inTransitAt: string | null
  deliveredAt: string | null
  failedAt: string | null
  events: DeliveryEventDto[]
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
