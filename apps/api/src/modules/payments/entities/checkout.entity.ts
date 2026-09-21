import type { Rel } from '@mikro-orm/core'
import { Collection, Entity, Enum, Index, ManyToOne, OneToMany, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { Payment } from '../payment.entity'

/**
 * A checkout: the buyer pays once for a cart that may span several shops.
 *
 * The checkout only carries what is genuinely common to the orders — the
 * provider's transaction, the payment method, the address, the collected
 * total. Each `Payment` still owns a `@OneToOne(Order)`, so that escrow keeps
 * releasing funds order by order: a shop is paid at its own pace, not the
 * slowest one's.
 */
export enum CheckoutStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  DISPATCHED = 'DISPATCHED',
  /** At least one order compensated, but not all of them. */
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  REFUNDED = 'REFUNDED',
  FAILED = 'FAILED',
}

export enum CheckoutDeliveryMode {
  DELIVERY = 'DELIVERY',
  ON_SITE = 'ON_SITE',
}

@Entity({ tableName: 'checkouts' })
export class Checkout {
  [OptionalProps]?: 'id' | 'status' | 'deliveryFee' | 'discount' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Index()
  @ManyToOne(() => User, { fieldName: 'buyer_id' })
  buyer!: Rel<User>

  @OneToMany(() => Payment, payment => payment.checkout)
  payments = new Collection<Payment>(this)

  /** What is actually collected: items − discount + fee. */
  @Property({ fieldName: 'total_amount', columnType: 'numeric(12,2)' })
  totalAmount!: number

  @Property({ fieldName: 'items_total', columnType: 'numeric(12,2)' })
  itemsTotal!: number

  /** Single run fee, 0 on an on-site pickup. */
  @Property({ fieldName: 'delivery_fee', columnType: 'numeric(12,2)', default: 0 })
  deliveryFee: number = 0

  /** Promo code discount, split across the shops in proportion. */
  @Property({ columnType: 'numeric(12,2)', default: 0 })
  discount: number = 0

  @Property({ fieldName: 'payment_method' })
  paymentMethod!: string

  @Index()
  @Property({ fieldName: 'provider_transaction_id', nullable: true })
  providerTransactionId?: string

  @Enum({ items: () => CheckoutStatus, default: CheckoutStatus.PENDING })
  status: CheckoutStatus = CheckoutStatus.PENDING

  /** One mode for the whole cart: mixed modes are out of scope for v1. */
  @Enum({ items: () => CheckoutDeliveryMode, fieldName: 'delivery_mode' })
  deliveryMode!: CheckoutDeliveryMode

  @Property({ fieldName: 'delivery_address', type: 'text', nullable: true })
  deliveryAddress?: string

  @Property({ fieldName: 'delivery_latitude', type: 'double', nullable: true })
  deliveryLatitude?: number

  @Property({ fieldName: 'delivery_longitude', type: 'double', nullable: true })
  deliveryLongitude?: number

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
