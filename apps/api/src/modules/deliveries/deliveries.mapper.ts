import type { CourierProfileResponse, DeliveryOffer, DeliveryResponse } from './contracts/delivery.contract'
import type { CourierProfile } from './entities/courier-profile.entity'
import type { DeliveryEvent } from './entities/delivery-event.entity'
import type { Delivery } from './entities/delivery.entity'
import { DeliveryStatus } from './entities/delivery.entity'

/** Who is looking at the delivery — shapes contacts and the confirmation code. */
export type DeliveryAudience = 'courier' | 'supplier' | 'buyer' | 'admin'

export interface OfferRow {
  id: string
  order_number: string
  pickup_address: string
  dropoff_address: string
  distance_km: string | number | null
  route_km: string | number | null
  dropoff_latitude: number | null
  dropoff_longitude: number | null
  delivery_fee: number | null
  courier_fee: number | null
  shop_name: string
  items_count: string | number
  total_amount: number
  offered_at: Date
}

export class DeliveriesMapper {
  static toCourierProfileResponse(profile: CourierProfile): CourierProfileResponse {
    return {
      id: profile.id,
      userId: profile.user.id,
      fullName: profile.fullName,
      phone: profile.phone,
      vehicleType: profile.vehicleType,
      zone: profile.zone,
      zoneLatitude: profile.zoneLatitude ?? null,
      zoneLongitude: profile.zoneLongitude ?? null,
      zoneRadiusKm: profile.zoneRadiusKm ?? null,
      identityDocument: profile.identityDocument ?? null,
      validationStatus: profile.validationStatus,
      rejectionReason: profile.rejectionReason ?? null,
      isAvailable: profile.isAvailable,
      validatedAt: profile.validatedAt?.toISOString() ?? null,
      createdAt: profile.createdAt.toISOString(),
    }
  }

  static toOffer(row: OfferRow): DeliveryOffer {
    return {
      id: row.id,
      orderNumber: row.order_number,
      pickupAddress: row.pickup_address,
      dropoffAddress: row.dropoff_address,
      distanceKm: row.distance_km === null ? null : Number(row.distance_km),
      routeKm: row.route_km === null ? null : Number(row.route_km),
      dropoffPosition: row.dropoff_latitude != null && row.dropoff_longitude != null
        ? { latitude: Number(row.dropoff_latitude), longitude: Number(row.dropoff_longitude) }
        : null,
      deliveryFee: Number(row.delivery_fee ?? 0),
      courierFee: Number(row.courier_fee ?? 0),
      supplierShopName: row.shop_name,
      itemsCount: Number(row.items_count),
      totalAmount: row.total_amount,
      offeredAt: new Date(row.offered_at).toISOString(),
    }
  }

  /**
   * Audience shaping: the buyer phone is only for the assigned courier, the
   * confirmation code only for the buyer (and admin), courier identity for
   * everyone once assigned.
   */
  static toResponse(delivery: Delivery, audience: DeliveryAudience, events: DeliveryEvent[]): DeliveryResponse {
    const order = delivery.order
    const showBuyerContact = audience === 'courier' || audience === 'admin'
    const showCode = audience === 'buyer' || audience === 'admin'
    // Live position: only while the courier is actually on the road, and never
    // echoed back to the courier themself.
    const inProgress = delivery.status === DeliveryStatus.ACCEPTED
      || delivery.status === DeliveryStatus.PICKED_UP
      || delivery.status === DeliveryStatus.IN_TRANSIT
    const courier = delivery.courier
    const showPosition = inProgress && audience !== 'courier'
      && courier?.lastLatitude != null && courier?.lastLongitude != null

    return {
      id: delivery.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: delivery.status,
      pickupAddress: delivery.pickupAddress,
      dropoffAddress: delivery.dropoffAddress,
      supplierShopName: order.supplier.shopName,
      buyerContact: showBuyerContact
        ? { name: order.buyer.name, phone: order.buyer.phone ?? null }
        : null,
      courier: delivery.courier
        ? { name: delivery.courier.fullName, phone: delivery.courier.phone }
        : null,
      courierVehicleType: delivery.courier?.vehicleType ?? null,
      courierPosition: showPosition && courier
        ? {
            latitude: courier.lastLatitude as number,
            longitude: courier.lastLongitude as number,
            updatedAt: courier.lastLocationAt?.toISOString() ?? null,
          }
        : null,
      pickupPosition: delivery.pickupLatitude != null && delivery.pickupLongitude != null
        ? { latitude: delivery.pickupLatitude, longitude: delivery.pickupLongitude }
        : null,
      dropoffPosition: delivery.order.deliveryLatitude != null && delivery.order.deliveryLongitude != null
        ? { latitude: delivery.order.deliveryLatitude, longitude: delivery.order.deliveryLongitude }
        : null,
      confirmationCode: showCode ? delivery.confirmationCode ?? null : null,
      proofType: delivery.proofType ?? null,
      failReason: delivery.failReason ?? null,
      failComment: delivery.failComment ?? null,
      itemsCount: order.items.isInitialized() ? order.items.count() : 0,
      totalAmount: order.totalAmount,
      paymentMethod: order.paymentMethod,
      deliveryFee: delivery.deliveryFee ?? 0,
      courierFee: delivery.courierFee ?? 0,
      acceptedAt: delivery.acceptedAt?.toISOString() ?? null,
      pickedUpAt: delivery.pickedUpAt?.toISOString() ?? null,
      inTransitAt: delivery.inTransitAt?.toISOString() ?? null,
      deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
      failedAt: delivery.failedAt?.toISOString() ?? null,
      events: events.map(event => ({
        type: event.type,
        occurredAt: event.occurredAt.toISOString(),
        payload: event.payload ?? null,
      })),
      createdAt: delivery.createdAt.toISOString(),
    }
  }
}
