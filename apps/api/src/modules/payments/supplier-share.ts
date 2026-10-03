/** What a shop's credit for one paid order is made of. */
export interface SupplierShareInput {
  /** The amount captured for this order. */
  paymentAmount: number
  commissionAmount: number
  deliveryFee: number
  /**
   * An eBio courier delivered (or, before delivery, will deliver) the order:
   * the delivery fee then pays the courier and eBio, not the shop.
   */
  deliveredByCourier: boolean
  discountFundedBy?: 'SUPPLIER' | 'PLATFORM' | null
  discountAmount: number
  platformPromoCompensation: number
}

export interface SupplierShare {
  /** The sale itself: paid amount, less the commission and a courier's fee. */
  sale: number
  /** What eBio pays back for its own promotions, so the shop nets full price. */
  compensation: number
  total: number
}

/**
 * The shop's share of an order paid online — the one place it is computed,
 * so the credit made at release and the « en attente » shown beforehand
 * cannot drift apart.
 */
export function supplierShare(input: SupplierShareInput): SupplierShare {
  const courierFee = input.deliveredByCourier ? input.deliveryFee : 0
  const sale = Math.max(0, Math.round((input.paymentAmount - input.commissionAmount - courierFee) * 100) / 100)
  const promoCode = input.discountFundedBy === 'PLATFORM' && input.discountAmount > 0 ? input.discountAmount : 0
  const promotion = input.platformPromoCompensation > 0 ? input.platformPromoCompensation : 0
  const compensation = promoCode + promotion
  return { sale, compensation, total: Math.round((sale + compensation) * 100) / 100 }
}
