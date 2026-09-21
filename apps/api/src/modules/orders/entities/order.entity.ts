import type { Rel } from '@mikro-orm/core'
import { Collection, Entity, Enum, Index, ManyToOne, OneToMany, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { Checkout } from '../../payments/entities/checkout.entity'
import { Supplier } from '../../suppliers/supplier.entity'
import { OrderItem } from './order-item.entity'

export enum OrderStatus {
  /** Online payment started but not confirmed — invisible to the supplier. */
  PENDING_PAYMENT = 'PENDING_PAYMENT',
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
  WALLET = 'WALLET',
}

@Entity({ tableName: 'orders' })
export class Order {
  [OptionalProps]?: 'id' | 'status' | 'deliveryFee' | 'commissionRate' | 'commissionAmount' | 'deliveryConfirmedByBuyer' | 'deliveryConfirmedBySupplier' | 'items' | 'createdAt' | 'updatedAt' | 'discountAmount' | 'sponsoredDeliveryFee' | 'platformPromoCompensation'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ fieldName: 'order_number', unique: true })
  orderNumber!: string

  @ManyToOne(() => User, { fieldName: 'buyer_id' })
  buyer!: Rel<User>

  @ManyToOne(() => Supplier, { fieldName: 'supplier_id' })
  supplier!: Rel<Supplier>

  /**
   * The checkout this order belongs to, when it comes from a
   * multi-shop cart. Null on a lone order and across the whole
   * l'historique.
   *
   * The link lives here and not on the payment: with cash on delivery no
   * payment is created, and orders would be orphaned from their cart.
   */
  @Index()
  @ManyToOne(() => Checkout, { fieldName: 'checkout_id', nullable: true })
  checkout?: Rel<Checkout>

  @Enum({ items: () => OrderStatus, default: OrderStatus.PLACED })
  status: OrderStatus = OrderStatus.PLACED

  @Enum({ items: () => PickupMode })
  pickupMode!: PickupMode

  @Enum({ items: () => PaymentMethod, type: 'string' })
  paymentMethod!: PaymentMethod

  @Property({ fieldName: 'delivery_address', nullable: true })
  deliveryAddress?: string

  // Drop-off point picked on the map at checkout — what the courier navigates to.
  @Property({ fieldName: 'delivery_latitude', type: 'float', nullable: true })
  deliveryLatitude?: number

  @Property({ fieldName: 'delivery_longitude', type: 'float', nullable: true })
  deliveryLongitude?: number

  @Property({ fieldName: 'delivery_slot', nullable: true, length: 200 })
  deliverySlot?: string

  /**
   * Delivery fee as it stood when the order was placed. Copied rather than read
   * back from the shop: a later price change must not rewrite past orders.
   * Included in `totalAmount`, and excluded from the commission base.
   */
  @Property({ fieldName: 'delivery_fee', type: 'float', default: 0 })
  deliveryFee: number = 0

  /** Items subtotal plus `deliveryFee` — what the buyer actually pays. */
  @Property({ fieldName: 'total_amount', type: 'float' })
  totalAmount!: number

  @Property({ fieldName: 'commission_rate', type: 'float', default: 0 })
  commissionRate: number = 0

  @Property({ fieldName: 'commission_amount', type: 'float', default: 0 })
  commissionAmount: number = 0

  @Property({ fieldName: 'promo_code_id', type: 'uuid', nullable: true })
  promoCodeId?: string | null

  @Property({ fieldName: 'discount_amount', type: 'float', default: 0 })
  discountAmount: number = 0

  /** SUPPLIER absorbs its own code; PLATFORM pays the shop back. */
  @Property({ fieldName: 'discount_funded_by', nullable: true })
  discountFundedBy?: 'SUPPLIER' | 'PLATFORM' | null

  /** Free-delivery promotion: who pays the courier instead of the buyer. */
  @Property({ fieldName: 'delivery_sponsor', nullable: true })
  deliverySponsor?: 'SUPPLIER' | 'PLATFORM' | null

  /** The real delivery fee when the buyer paid none (deliveryFee is then 0). */
  @Property({ fieldName: 'sponsored_delivery_fee', type: 'float', default: 0 })
  sponsoredDeliveryFee: number = 0

  /** What eBio owes the shop for its own price / gift promotions on this order. */
  @Property({ fieldName: 'platform_promo_compensation', type: 'float', default: 0 })
  platformPromoCompensation: number = 0

  @Property({ fieldName: 'delivery_confirmed_by_buyer', default: false })
  deliveryConfirmedByBuyer: boolean = false

  @Property({ fieldName: 'delivery_confirmed_by_supplier', default: false })
  deliveryConfirmedBySupplier: boolean = false

  @Property({ fieldName: 'accepted_at', nullable: true })
  acceptedAt?: Date

  /** Shop's estimate of when the parcel will be ready, set when preparation starts. */
  @Property({ fieldName: 'estimated_ready_at', type: 'Date', nullable: true })
  estimatedReadyAt?: Date | null

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
