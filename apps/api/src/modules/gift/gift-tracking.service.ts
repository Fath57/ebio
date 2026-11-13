import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'
import { Delivery } from '../deliveries/entities/delivery.entity'
import { Order, OrderStatus } from '../orders/entities/order.entity'
import { Checkout, CheckoutStatus } from '../payments/entities/checkout.entity'

/** What the public tracking link is built from. */
export interface GiftTrackingBundle {
  checkout: Checkout
  orders: Order[]
  /** Every delivery of those orders, oldest first: a reassignment adds one. */
  deliveries: Delivery[]
}

/** Tokens are 24 characters; anything far longer is not one of ours. */
const TOKEN_MAX_LENGTH = 64

/**
 * Loads a cart sent to a relative from its public tracking token.
 *
 * A checkout never paid has no tracking to show: the link was only texted
 * after payment, so an unpaid or failed one answers like an unknown token.
 */
@Injectable()
export class GiftTrackingService {
  constructor(private readonly em: EntityManager) {}

  async findByToken(token: string): Promise<GiftTrackingBundle | null> {
    if (!token || token.length > TOKEN_MAX_LENGTH) {
      return null
    }
    const checkout = await this.em.findOne(Checkout, { trackingToken: token }, { populate: ['buyer'] })
    if (!checkout?.recipientPhone) {
      return null
    }
    if (checkout.status === CheckoutStatus.PENDING || checkout.status === CheckoutStatus.FAILED) {
      return null
    }

    const orders = await this.em.find(
      Order,
      { checkout: { id: checkout.id }, status: { $ne: OrderStatus.PENDING_PAYMENT } },
      { populate: ['supplier', 'items', 'items.product'], orderBy: { createdAt: 'ASC' } },
    )
    const deliveries = orders.length === 0
      ? []
      : await this.em.find(
          Delivery,
          { order: { $in: orders.map(order => order.id) } },
          { populate: ['courier'], orderBy: { createdAt: 'ASC' } },
        )
    return { checkout, orders, deliveries }
  }
}
