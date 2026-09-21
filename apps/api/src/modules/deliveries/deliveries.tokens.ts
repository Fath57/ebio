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
   * Ouvre une tournée d'un passage en caisse livré. Un panier en ouvre
   * plusieurs dès que le regroupement ne tient pas en une seule. Les
   * livraisons s'y rattachent au fur et à mesure qu'elles naissent, chacune
   * rejoignant la tournée qui collecte chez sa boutique.
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
 * Ce que le module paiements demande au module livraisons quand une commande
 * tombe. Même raison que ci-dessus : un jeton, pas une dépendance de service,
 * sinon les deux modules s'importent l'un l'autre.
 */
export const DELIVERY_RUN_HOOKS = Symbol('DELIVERY_RUN_HOOKS')

export interface DeliveryRunHooks {
  /**
   * Retire une boutique de la tournée d'un panier et rechiffre le trajet.
   *
   * Renvoie l'écart de frais à rendre à l'acheteur, ou `null` quand il n'y a
   * pas de tournée — retrait sur place, ou commande d'avant le panier unifié.
   * Une tournée qui perd sa dernière boutique est annulée.
   */
  removeSupplierFromRun: (input: {
    checkoutId: string
    supplierId: string
  }) => Promise<{ runId: string, refund: number, remainingShops: number } | null>
}
