import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, ManyToOne, OptionalProps, PrimaryKey, Property, Unique } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { Order } from '../../orders/entities/order.entity'
import { Supplier } from '../../suppliers/supplier.entity'

export enum TransactionType {
  ORDER = 'ORDER',
  CONTACT = 'CONTACT',
}

@Entity({ tableName: 'reviews' })
@Unique({ properties: ['buyer', 'order'] })
export class Review {
  [OptionalProps]?: 'id' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => User, { fieldName: 'buyer_id' })
  buyer!: Rel<User>

  @ManyToOne(() => Supplier, { fieldName: 'supplier_id' })
  supplier!: Rel<Supplier>

  @ManyToOne(() => Order, { fieldName: 'order_id', nullable: true })
  order?: Rel<Order>

  @Enum({ items: () => TransactionType })
  transactionType!: TransactionType

  @Property({ fieldName: 'quality_rating', type: 'smallint' })
  qualityRating!: number

  @Property({ fieldName: 'delay_rating', type: 'smallint' })
  delayRating!: number

  @Property({ fieldName: 'communication_rating', type: 'smallint' })
  communicationRating!: number

  @Property({ fieldName: 'conformity_rating', type: 'smallint' })
  conformityRating!: number

  @Property({ type: 'text', nullable: true })
  comment?: string

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()
}
