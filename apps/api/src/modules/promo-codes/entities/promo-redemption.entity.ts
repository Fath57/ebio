import type { Rel } from '@mikro-orm/core'
import { Entity, Index, ManyToOne, OneToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { Order } from '../../orders/entities/order.entity'
import { PromoCode } from './promo-code.entity'

/**
 * One row per order that used a code — the audited source the use counters
 * are checked against, and what gets released when an order is cancelled.
 */
@Entity({ tableName: 'promo_redemptions' })
@Index({ properties: ['promoCode', 'user'] })
export class PromoRedemption {
  [OptionalProps]?: 'id' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => PromoCode, { fieldName: 'promo_code_id', deleteRule: 'cascade' })
  promoCode!: Rel<PromoCode>

  @ManyToOne(() => User, { fieldName: 'user_id' })
  user!: Rel<User>

  @OneToOne(() => Order, { fieldName: 'order_id', owner: true, deleteRule: 'cascade' })
  order!: Rel<Order>

  @Property({ fieldName: 'amount_discounted', type: 'float' })
  amountDiscounted!: number

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()
}
