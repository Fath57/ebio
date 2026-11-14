import type { DisplayCurrency } from '../currency/contracts/currency.contract'
import type { DisputeResponse, OrderDeliverySummary, OrderDisplay, OrderGift, OrderProof, OrderResponse, OrderSupplierPayout } from './contracts/order.contract'
import { wrap } from '@mikro-orm/core'
import { thumbnailUrlFor } from '../../common/media-urls'
import { supplierShare } from '../payments/supplier-share'
import { Dispute } from './entities/dispute.entity'
import { Order, OrderStatus, PickupMode } from './entities/order.entity'

/** What only the payer reads on their order: the relative, the frozen currency, the proof. */
export interface OrderPayerView {
  gift?: OrderGift | null
  display?: OrderDisplay | null
  proof?: OrderProof | null
}

/** What the order's own row does not carry. */
export interface OrderExtras {
  /** EXPORT order: when the shop must hand it to eBio (011). */
  collectBefore?: Date | null
  /** The reader is the shop (or the back-office): the order carries its payout. */
  supplierView?: boolean
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

  /**
   * What the shop nets on the order, the same computation as the escrow
   * release and the « en attente » of the wallet: before delivery, a delivery
   * order counts as carried by an eBio courier; once delivered, only if a
   * courier actually did.
   */
  static supplierPayoutOf(order: Order, delivery: OrderDeliverySummary | null): OrderSupplierPayout {
    const deliveredByCourier = order.status === OrderStatus.DELIVERED
      ? delivery !== null && delivery.status === 'DELIVERED' && delivery.courierName !== null
      : order.pickupMode === PickupMode.DELIVERY
    const share = supplierShare({
      paymentAmount: Number(order.totalAmount),
      commissionAmount: Number(order.commissionAmount),
      deliveryFee: Number(order.deliveryFee),
      deliveredByCourier,
      discountFundedBy: order.discountFundedBy,
      discountAmount: Number(order.discountAmount ?? 0),
      platformPromoCompensation: Number(order.platformPromoCompensation ?? 0),
    })
    return {
      commission: Number(order.commissionAmount),
      courierFee: deliveredByCourier ? Number(order.deliveryFee) : 0,
      compensation: share.compensation,
      total: share.total,
    }
  }

  static toResponse(order: Order, delivery: OrderDeliverySummary | null = null, payer: OrderPayerView = {}, extras: OrderExtras = {}): OrderResponse {
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
      collectBefore: extras.collectBefore?.toISOString() ?? null,
      supplierPayout: extras.supplierView === true ? OrderMapper.supplierPayoutOf(order, delivery) : null,
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
