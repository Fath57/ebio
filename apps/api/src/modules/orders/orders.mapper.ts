import type { DisplayCurrency } from '../currency/contracts/currency.contract'
import type { DisputeResponse, OrderDeliverySummary, OrderDisplay, OrderGift, OrderProof, OrderResponse } from './contracts/order.contract'
import { wrap } from '@mikro-orm/core'
import { thumbnailUrlFor } from '../../common/media-urls'
import { Dispute } from './entities/dispute.entity'
import { Order } from './entities/order.entity'

/** What only the payer reads on their order: the relative, the frozen currency, the proof. */
export interface OrderPayerView {
  gift?: OrderGift | null
  display?: OrderDisplay | null
  proof?: OrderProof | null
}

export class OrderMapper {
  /** The frozen foreign-currency amount of the order's checkout; needs `checkout` populated. */
  static displayOf(order: Order): OrderDisplay | null {
    const checkout = order.checkout
    if (!checkout || !wrap(checkout).isInitialized() || checkout.fxRate == null || checkout.displayTotal == null) {
      return null
    }
    return {
      currency: checkout.displayCurrency as DisplayCurrency,
      rate: Number(checkout.fxRate),
      total: Number(checkout.displayTotal),
    }
  }

  static toResponse(order: Order, delivery: OrderDeliverySummary | null = null, payer: OrderPayerView = {}): OrderResponse {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      checkoutId: order.checkout?.id ?? null,
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
      deliveryWindowStart: order.deliveryWindowStart?.toISOString() ?? null,
      deliveryWindowEnd: order.deliveryWindowEnd?.toISOString() ?? null,
      deliveryFee: order.deliveryFee,
      totalAmount: order.totalAmount,
      discountAmount: order.discountAmount ?? 0,
      commissionRate: order.commissionRate,
      commissionAmount: order.commissionAmount,
      deliveryConfirmedByBuyer: order.deliveryConfirmedByBuyer,
      deliveryConfirmedBySupplier: order.deliveryConfirmedBySupplier,
      acceptedAt: order.acceptedAt?.toISOString() ?? null,
      estimatedReadyAt: order.estimatedReadyAt?.toISOString() ?? null,
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
            isGift: item.isGift,
          }))
        : [],
      delivery,
      gift: payer.gift ?? null,
      display: payer.display ?? null,
      proof: payer.proof ?? null,
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
