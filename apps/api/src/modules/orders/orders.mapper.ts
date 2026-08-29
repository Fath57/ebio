import type { DisputeResponse, OrderDeliverySummary, OrderResponse } from './contracts/order.contract'
import { thumbnailUrlFor } from '../../common/media-urls'
import { Dispute } from './entities/dispute.entity'
import { Order } from './entities/order.entity'

export class OrderMapper {
  static toResponse(order: Order, delivery: OrderDeliverySummary | null = null): OrderResponse {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      buyerId: order.buyer.id,
      buyerName: order.buyer.name,
      supplierId: order.supplier.id,
      supplierName: order.supplier.shopName,
      status: order.status,
      pickupMode: order.pickupMode,
      paymentMethod: order.paymentMethod,
      deliveryAddress: order.deliveryAddress ?? null,

      deliveryLatitude: order.deliveryLatitude ?? null,
      deliveryLongitude: order.deliveryLongitude ?? null,
      deliverySlot: order.deliverySlot ?? null,
      deliveryFee: order.deliveryFee,
      totalAmount: order.totalAmount,
      discountAmount: order.discountAmount ?? 0,
      commissionRate: order.commissionRate,
      commissionAmount: order.commissionAmount,
      deliveryConfirmedByBuyer: order.deliveryConfirmedByBuyer,
      deliveryConfirmedBySupplier: order.deliveryConfirmedBySupplier,
      acceptedAt: order.acceptedAt?.toISOString() ?? null,
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      escrowReleasedAt: order.escrowReleasedAt?.toISOString() ?? null,
      items: order.items.isInitialized()
        ? order.items.getItems().map(item => ({
            id: item.id,
            productId: item.product.id,
            productName: item.product.name,
            productPhoto: item.product.photos?.[0] ?? null,
            productThumbnail: thumbnailUrlFor(item.product.photos?.[0]),
            variantId: item.variant?.id ?? null,
            variantLabel: item.variant?.label ?? null,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          }))
        : [],
      delivery,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    }
  }

  static toDisputeResponse(dispute: Dispute): DisputeResponse {
    return {
      id: dispute.id,
      orderId: dispute.order.id,
      openedById: dispute.openedBy.id,
      reason: dispute.reason,
      status: dispute.status,
      adminNotes: dispute.adminNotes ?? null,
      resolvedAt: dispute.resolvedAt?.toISOString() ?? null,
      createdAt: dispute.createdAt.toISOString(),
    }
  }
}
