import type { Rel } from '@mikro-orm/core'
import { Collection, Entity, Enum, ManyToOne, OneToMany, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { Supplier } from '../../suppliers/supplier.entity'
import { OrderItem } from './order-item.entity'

export enum OrderStatus {
  PLACED = 'PLACED',
  ACCEPTED = 'ACCEPTED',
  PREPARING = 'PREPARING',
  READY = 'READY',
  IN_DELIVERY = 'IN_DELIVERY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  DISPUTED = 'DISPUTED',
}

export enum PickupMode {
  ON_SITE = 'ON_SITE',
  DELIVERY = 'DELIVERY',
}

export enum PaymentMethod {
  FEDAPAY = 'FEDAPAY',
  CASH_ON_DELIVERY = 'CASH_ON_DELIVERY',
}

@Entity({ tableName: 'orders' })
export class Order {
  [OptionalProps]?: 'id' | 'status' | 'commissionRate' | 'commissionAmount' | 'deliveryConfirmedByBuyer' | 'deliveryConfirmedBySupplier' | 'items' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ fieldName: 'order_number', unique: true })
  orderNumber!: string

  @ManyToOne(() => User, { fieldName: 'buyer_id' })
  buyer!: Rel<User>

  @ManyToOne(() => Supplier, { fieldName: 'supplier_id' })
  supplier!: Rel<Supplier>

  @Enum({ items: () => OrderStatus, default: OrderStatus.PLACED })
  status: OrderStatus = OrderStatus.PLACED

  @Enum({ items: () => PickupMode })
  pickupMode!: PickupMode

  @Enum({ items: () => PaymentMethod, type: 'string' })
  paymentMethod!: PaymentMethod

  @Property({ fieldName: 'delivery_address', nullable: true })
  deliveryAddress?: string

  @Property({ fieldName: 'delivery_slot', nullable: true, length: 200 })
  deliverySlot?: string

  @Property({ fieldName: 'total_amount', type: 'float' })
  totalAmount!: number

  @Property({ fieldName: 'commission_rate', type: 'float', default: 0 })
  commissionRate: number = 0

  @Property({ fieldName: 'commission_amount', type: 'float', default: 0 })
  commissionAmount: number = 0

  @Property({ fieldName: 'delivery_confirmed_by_buyer', default: false })
  deliveryConfirmedByBuyer: boolean = false

  @Property({ fieldName: 'delivery_confirmed_by_supplier', default: false })
  deliveryConfirmedBySupplier: boolean = false

  @Property({ fieldName: 'accepted_at', nullable: true })
  acceptedAt?: Date

  @Property({ fieldName: 'delivered_at', nullable: true })
  deliveredAt?: Date

  @Property({ fieldName: 'escrow_released_at', nullable: true })
  escrowReleasedAt?: Date

  @OneToMany(() => OrderItem, item => item.order)
  items = new Collection<OrderItem>(this)

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
