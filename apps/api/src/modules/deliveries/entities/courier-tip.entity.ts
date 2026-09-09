import type { Rel } from '@mikro-orm/core'
import { Entity, ManyToOne, OneToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { Order } from '../../orders/entities/order.entity'
import { CourierProfile } from './courier-profile.entity'
import { Delivery } from './delivery.entity'

/**
 * A tip the buyer left for the courier after delivery. The money moves
 * buyer wallet → courier wallet in full (eBio takes nothing); this row is
 * the business record, the ledger lines are in wallet_transactions.
 */
@Entity({ tableName: 'courier_tips' })
export class CourierTip {
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

  /** Integer FCFA. */
  @Property({ type: 'int' })
  amount!: number

  @Property({ fieldName: 'created_at' })
  createdAt: Date = new Date()
}
