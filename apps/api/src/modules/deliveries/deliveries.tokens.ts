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
   * Ouvre la tournée d'un passage en caisse livré. Les livraisons s'y
   * rattachent au fur et à mesure qu'elles naissent, commande par commande.
   */
  createRunForCheckout: (input: {
    checkoutId: string
    supplierIds: string[]
    deliveryFee: number
    distanceKm: number | null
  }) => Promise<{ id: string } | null>
  createForOrder: (order: Order) => Promise<Delivery | null>
  /** PREPARING with a readiness estimate: create the run now, search later. */
  scheduleForOrder: (order: Order) => Promise<Delivery | null>
  cancelForOrder: (order: Order) => Promise<void>
  handleSupplierTakeover: (order: Order) => Promise<void>
  closeForOrder: (order: Order) => Promise<void>
}
