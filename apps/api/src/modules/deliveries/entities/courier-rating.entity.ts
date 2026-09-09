import type { Rel } from '@mikro-orm/core'
import { Entity, ManyToOne, OneToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { Order } from '../../orders/entities/order.entity'
import { CourierProfile } from './courier-profile.entity'
import { Delivery } from './delivery.entity'

/**
 * The buyer's 1–5 rating of the courier who delivered their order. One per
 * delivery; the courier profile carries the running average.
 */
@Entity({ tableName: 'courier_ratings' })
export class CourierRating {
  [OptionalProps]?: 'id' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @OneToOne(() => Delivery, { fieldName: 'delivery_id', owner: true, unique: true, deleteRule: 'cascade' })
  delivery!: Rel<Delivery>

  @ManyToOne(() => CourierProfile, { fieldName: 'courier_id', deleteRule: 'cascade' })
  courier!: Rel<CourierProfile>

  @ManyToOne(() => User, { fieldName: 'buyer_id', deleteRule: 'cascade' })
  buyer!: Rel<User>

  @ManyToOne(() => Order, { fieldName: 'order_id', deleteRule: 'cascade' })
  order!: Rel<Order>

  @Property({ type: 'smallint' })
  rating!: number

  @Property({ type: 'text', nullable: true })
  comment?: string

  @Property({ fieldName: 'created_at' })
  createdAt: Date = new Date()
}
