/**
 * Single source of truth for what a delivery costs the buyer.
 *
 * The model is a flat fee per shop, optionally waived above a subtotal the shop
 * chooses. It is deliberately simple: no supplier had ever drawn a delivery
 * zone, so charging was gated behind a step nobody took.
 */

export interface DeliveryPricing {
  /** Flat fee on a delivery order. Zero or absent means delivery is free. */
  deliveryFee?: number | null
  /** Items subtotal above which the fee is waived. Null disables the waiver. */
  freeDeliveryFrom?: number | null
}

/**
 * Fee due for an order.
 *
 * @param isDelivery False for a pickup: nothing is delivered, nothing is owed.
 * @param itemsTotal Items only. The fee is never part of its own waiver test,
 * which would otherwise let a large fee unlock free delivery on a small basket.
 */
export function computeDeliveryFee(
  pricing: DeliveryPricing,
  isDelivery: boolean,
  itemsTotal: number,
): number {
  if (!isDelivery) {
    return 0
  }

  const fee = pricing.deliveryFee ?? 0
  if (fee <= 0) {
    return 0
  }

  const threshold = pricing.freeDeliveryFrom
  if (threshold !== null && threshold !== undefined && itemsTotal >= threshold) {
    return 0
  }

  return fee
}
