import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, Index, OneToOne, OptionalProps, PrimaryKey, Property, Unique } from '@mikro-orm/core'
import { Order } from '../orders/entities/order.entity'

export enum PaymentStatus {
  PENDING = 'PENDING',
  CAPTURED = 'CAPTURED',
  ESCROW = 'ESCROW',
  RELEASED = 'RELEASED',
  REFUNDED = 'REFUNDED',
  FAILED = 'FAILED',
}

export enum PaymentProvider {
  FEDAPAY = 'fedapay',
  STRIPE = 'stripe',
  PAWERPAYER = 'pawerpayer',
}

export enum PaymentMethodType {
  MOBILE = 'mobile',
  CARD = 'card',
}

export enum MobileOperator {
  MTN = 'MTN',
  MOOV = 'MOOV',
  ORANGE = 'ORANGE',
}

@Entity({ tableName: 'payments' })
@Unique({ properties: ['provider', 'providerTransactionId'] })
export class Payment {
  [OptionalProps]?: 'id' | 'status' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @OneToOne(() => Order, { fieldName: 'order_id', owner: true })
  order!: Rel<Order>

  @Property({ type: 'float' })
  amount!: number

  @Enum({ items: () => PaymentProvider })
  provider!: PaymentProvider

  @Property({ fieldName: 'provider_transaction_id', nullable: true })
  providerTransactionId?: string

  @Property({ fieldName: 'provider_reference', nullable: true })
  providerReference?: string

  @Property({ fieldName: 'provider_payment_method_id', nullable: true })
  providerPaymentMethodId?: string

  @Property({ fieldName: 'payment_method' })
  paymentMethod!: string

  @Enum({ items: () => MobileOperator, nullable: true })
  operator?: MobileOperator

  @Property({ fieldName: 'phone_number', nullable: true })
  phoneNumber?: string

  @Enum({ items: () => PaymentStatus, default: PaymentStatus.PENDING })
  @Index()
  status: PaymentStatus = PaymentStatus.PENDING

  @Property({ fieldName: 'paid_at', nullable: true })
  paidAt?: Date

  @Property({ fieldName: 'released_at', nullable: true })
  releasedAt?: Date

  @Property({ fieldName: 'refunded_at', nullable: true })
  refundedAt?: Date

  @Property({ fieldName: 'receipt_url', nullable: true })
  receiptUrl?: string

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
