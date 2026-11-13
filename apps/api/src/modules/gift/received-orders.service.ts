import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { Order, OrderStatus } from '../orders/entities/order.entity'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

/**
 * « Paniers reçus »: the carts sent to this account's phone number by
 * someone else. Only a number proven by an SMS code links anything; a
 * number typed in the profile, or changed since, shows nothing.
 */
@Injectable()
export class ReceivedOrdersService {
  constructor(private readonly em: EntityManager) {}

  async list(userId: string, page = 1, limit = DEFAULT_LIMIT): Promise<{ orders: Order[], total: number }> {
    const user = await this.em.findOne(User, { id: userId })
    if (!user?.phone || !user.phoneVerifiedAt) {
      return { orders: [], total: 0 }
    }
    const size = Math.min(Math.max(1, Math.floor(limit) || DEFAULT_LIMIT), MAX_LIMIT)
    const offset = (Math.max(1, Math.floor(page) || 1) - 1) * size

    const [orders, total] = await this.em.findAndCount(
      Order,
      {
        checkout: { recipientPhone: user.phone },
        // Paid carts only; and a cart one sends oneself is an ordinary order.
        status: { $ne: OrderStatus.PENDING_PAYMENT },
        buyer: { id: { $ne: userId } },
      },
      {
        populate: ['buyer', 'supplier', 'items', 'items.product'],
        orderBy: { createdAt: 'DESC' },
        limit: size,
        offset,
      },
    )
    return { orders, total }
  }
}
