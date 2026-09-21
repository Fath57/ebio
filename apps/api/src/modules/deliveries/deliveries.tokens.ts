import type { Order } from '../orders/entities/order.entity'
import type { Delivery } from './entities/delivery.entity'

/**
 * Injection token breaking the OrdersService ↔ DeliveriesService require
 * cycle: OrdersService only imports this file (no runtime dependency on the
 * deliveries service class), while DeliveriesModule binds the token to the
 * real implementation via useExisting.
 */
export const ORDER_DELIVERY_HOOKS = Symbol('ORDER_DELIVERY_HOOKS')

export interface OrderDeliveryHooks {
  /**
   * Opens a run of a delivered checkout. A cart opens several as soon as the
   * grouping does not fit in one. Deliveries join as they are born, each one
   * reaching the run that collects from its shop.
   */
  createRunForCheckout: (input: {
    checkoutId: string
    supplierIds: string[]
    deliveryFee: number
    distanceKm: number | null
    pickupSpreadKm: number | null
  }) => Promise<{ id: string } | null>
  createForOrder: (order: Order) => Promise<Delivery | null>
  /** PREPARING with a readiness estimate: create the run now, search later. */
  scheduleForOrder: (order: Order) => Promise<Delivery | null>
  cancelForOrder: (order: Order) => Promise<void>
  handleSupplierTakeover: (order: Order) => Promise<void>
  closeForOrder: (order: Order) => Promise<void>
}

/**
 * What the payments module asks of the deliveries module when an order falls
 * through. Same reason as above: a token, not a service dependency, otherwise
 * the two modules import each other.
 */
export const DELIVERY_RUN_HOOKS = Symbol('DELIVERY_RUN_HOOKS')

export interface DeliveryRunHooks {
  /**
   * Removes a shop from a cart's run and re-prices the ride.
   *
   * Returns the fee difference owed to the buyer, or `null` when there is no
   * run — on-site pickup, or an order from before the unified cart. A run that
   * loses its last shop is cancelled.
   */
  removeSupplierFromRun: (input: {
    checkoutId: string
    supplierId: string
  }) => Promise<{ runId: string, refund: number, remainingShops: number } | null>
}
