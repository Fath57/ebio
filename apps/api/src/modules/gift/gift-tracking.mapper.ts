import type { GiftTrackingResponse, GiftTrackingStatus } from './contracts/gift.contract'
import type { GiftTrackingBundle } from './gift-tracking.service'
import { wrap } from '@mikro-orm/core'
import { thumbnailUrlFor } from '../../common/media-urls'
import { Delivery, DeliveryStatus } from '../deliveries/entities/delivery.entity'
import { Order, OrderStatus } from '../orders/entities/order.entity'
import { firstName } from './gift-texts'

/** The link keeps its detail this long after the cart is handed over, failed or cancelled (FR-012). */
export const TRACKING_DETAIL_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

const TERMINAL: ReadonlySet<GiftTrackingStatus> = new Set(['DELIVERED', 'FAILED', 'CANCELLED'])
const ON_THE_ROAD: ReadonlySet<DeliveryStatus> = new Set([DeliveryStatus.PICKED_UP, DeliveryStatus.IN_TRANSIT])
const AT_THE_SHOP: ReadonlySet<OrderStatus> = new Set([OrderStatus.ACCEPTED, OrderStatus.PREPARING, OrderStatus.READY])
/** A dispute is opened after the hand-over: for the relative, the cart arrived. */
const HANDED_OVER: ReadonlySet<OrderStatus> = new Set([OrderStatus.DELIVERED, OrderStatus.DISPUTED])

/** The latest delivery of each order: a reassignment leaves the earlier ones behind. */
function latestDeliveries(deliveries: Delivery[]): Map<string, Delivery> {
  const latest = new Map<string, Delivery>()
  for (const delivery of deliveries) {
    const current = latest.get(delivery.order.id)
    if (!current || current.createdAt.getTime() <= delivery.createdAt.getTime()) {
      latest.set(delivery.order.id, delivery)
    }
  }
  return latest
}

function latest(dates: Array<Date | null | undefined>): Date | null {
  let found: Date | null = null
  for (const date of dates) {
    if (date && (!found || date.getTime() > found.getTime())) {
      found = date
    }
  }
  return found
}

/**
 * The public tracking page of a cart sent to a relative (contracts §5).
 *
 * Built field by field, never by spreading an entity: whatever is added to an
 * order later must not leak onto a page anyone holding the link can read. No
 * price, no hand-over code, no phone, no written address.
 */
export class GiftTrackingMapper {
  /** One status for the whole cart, however many shops it spans. */
  static statusOf(orders: Order[], deliveries: Map<string, Delivery>): GiftTrackingStatus {
    const active = orders.filter(order => order.status !== OrderStatus.CANCELLED)
    if (active.length === 0) {
      // A failed hand-over to a relative cancels the order and keeps the delivery FAILED.
      const failed = orders.some(order => deliveries.get(order.id)?.status === DeliveryStatus.FAILED)
      return failed ? 'FAILED' : 'CANCELLED'
    }
    if (active.every(order => HANDED_OVER.has(order.status))) {
      return 'DELIVERED'
    }
    const onTheRoad = active.some((order) => {
      const delivery = deliveries.get(order.id)
      return order.status === OrderStatus.IN_DELIVERY || (delivery !== undefined && ON_THE_ROAD.has(delivery.status))
    })
    if (onTheRoad) {
      return 'IN_TRANSIT'
    }
    if (active.some(order => AT_THE_SHOP.has(order.status))) {
      return 'PREPARING'
    }
    return 'PAID'
  }

  /** When the cart stopped moving; null while it is still on its way. */
  static endedAt(bundle: GiftTrackingBundle, deliveries: Map<string, Delivery>): Date | null {
    const ends: Array<Date | null | undefined> = []
    for (const order of bundle.orders) {
      const delivery = deliveries.get(order.id)
      ends.push(order.deliveredAt, delivery?.deliveredAt, delivery?.failedAt)
      if (order.status === OrderStatus.CANCELLED) {
        ends.push(order.updatedAt)
      }
    }
    return latest(ends) ?? bundle.checkout.updatedAt
  }

  static toResponse(bundle: GiftTrackingBundle, now: Date = new Date()): GiftTrackingResponse {
    const deliveries = latestDeliveries(bundle.deliveries)
    const status = GiftTrackingMapper.statusOf(bundle.orders, deliveries)

    if (TERMINAL.has(status)) {
      const endedAt = GiftTrackingMapper.endedAt(bundle, deliveries)
      if (endedAt && now.getTime() - endedAt.getTime() > TRACKING_DETAIL_DAYS * DAY_MS) {
        return { status, expired: true }
      }
    }

    const { checkout } = bundle
    // What is still coming, unless nothing is: then what was ordered.
    const active = bundle.orders.filter(order => order.status !== OrderStatus.CANCELLED)
    const shown = active.length > 0 ? active : bundle.orders
    const withWindow = shown.find(order => order.deliveryWindowStart && order.deliveryWindowEnd)

    return {
      payerFirstName: firstName(wrap(checkout.buyer).isInitialized() ? checkout.buyer.name : null),
      recipientFirstName: firstName(checkout.recipientName),
      status,
      window: withWindow
        ? { start: withWindow.deliveryWindowStart!.toISOString(), end: withWindow.deliveryWindowEnd!.toISOString() }
        : null,
      shops: [...new Set(shown.map(order => order.supplier.shopName))].map(name => ({ name })),
      lines: shown.flatMap(order => order.items.isInitialized()
        ? order.items.getItems().map((item) => {
            const photo = item.product.photos?.[0] ?? null
            return {
              name: item.product.name,
              quantity: item.quantity,
              imageUrl: thumbnailUrlFor(photo) ?? photo,
            }
          })
        : []),
      courierPosition: status === 'IN_TRANSIT' ? GiftTrackingMapper.courierPosition(shown, deliveries) : null,
      destination: checkout.deliveryLatitude != null && checkout.deliveryLongitude != null
        ? { latitude: checkout.deliveryLatitude, longitude: checkout.deliveryLongitude }
        : null,
      expired: false,
    }
  }

  /** Only once the cart has been collected and until it is handed over. */
  private static courierPosition(orders: Order[], deliveries: Map<string, Delivery>): { latitude: number, longitude: number, at: string | null } | null {
    for (const order of orders) {
      const delivery = deliveries.get(order.id)
      const courier = delivery?.courier
      if (!delivery || !ON_THE_ROAD.has(delivery.status) || !courier || !wrap(courier).isInitialized()) {
        continue
      }
      if (courier.lastLatitude != null && courier.lastLongitude != null) {
        return {
          latitude: courier.lastLatitude,
          longitude: courier.lastLongitude,
          at: courier.lastLocationAt?.toISOString() ?? null,
        }
      }
    }
    return null
  }
}
