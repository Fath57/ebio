import type { Order } from '../orders/entities/order.entity'
import type { ReceivedOrder } from './contracts/gift.contract'
import { thumbnailUrlFor } from '../../common/media-urls'
import { OrderStatus } from '../orders/entities/order.entity'
import { firstName } from './gift-texts'

/** A received cart as the relative reads it: what, from whom, from where, never an amount (FR-031). */
export class ReceivedOrdersMapper {
  static toResponse(order: Order): ReceivedOrder {
    return {
      orderId: order.id,
      payerFirstName: firstName(order.buyer.name),
      supplierId: order.supplier.id,
      shopName: order.supplier.shopName,
      status: order.status,
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      lines: order.items.isInitialized()
        ? order.items.getItems().map((item) => {
            const photo = item.product.photos?.[0] ?? null
            return {
              productId: item.product.id,
              name: item.product.name,
              quantity: item.quantity,
              imageUrl: thumbnailUrlFor(photo) ?? photo,
            }
          })
        : [],
      canReview: order.status === OrderStatus.DELIVERED,
    }
  }
}
