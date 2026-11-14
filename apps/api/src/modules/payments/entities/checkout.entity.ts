import type { Rel } from '@mikro-orm/core'
import { Collection, Entity, Enum, Index, ManyToOne, OneToMany, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { FamilyWalletMember } from '../../family-wallet/entities/family-wallet-member.entity'
import { SavedRelative } from '../../relatives/entities/saved-relative.entity'
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
  /** A terroir parcel (011): the orders of several shops, shipped abroad. */
  EXPORT = 'EXPORT',
}

@Entity({ tableName: 'checkouts' })
export class Checkout {
  [OptionalProps]?: 'id' | 'status' | 'deliveryFee' | 'discount' | 'recipientSmsResendCount' | 'displayCurrency' | 'isGift' | 'createdAt' | 'updatedAt'

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

  /**
   * The relative the cart is delivered to, frozen at checkout: editing or
   * deleting the address-book entry later never rewrites a past order. Name,
   * phone and tracking token are set together or not at all (CHECK).
   */
  @Property({ fieldName: 'recipient_name', type: 'string', length: 120, nullable: true })
  recipientName?: string | null

  @Property({ fieldName: 'recipient_phone', type: 'string', length: 16, nullable: true })
  recipientPhone?: string | null

  /** Where the recipient came from, if picked in the address book. */
  @ManyToOne(() => SavedRelative, { fieldName: 'saved_relative_id', nullable: true, deleteRule: 'set null' })
  savedRelative?: Rel<SavedRelative> | null

  /**
   * The family wallet member who paid, when `paymentMethod` is FAMILY_WALLET
   * (CHECK both ways). It routes a refund back to that family wallet.
   */
  @Index({ name: 'checkouts_family_member_idx' })
  @ManyToOne(() => FamilyWalletMember, { fieldName: 'family_member_id', nullable: true })
  familyMember?: Rel<FamilyWalletMember> | null

  /** Opaque token of the public tracking link sent to the recipient. */
  @Property({ fieldName: 'tracking_token', type: 'string', length: 32, nullable: true, unique: true })
  trackingToken?: string | null

  /** Resends of the recipient SMS asked by the payer, 3 at most. */
  @Property({ fieldName: 'recipient_sms_resend_count', type: 'smallint', default: 0 })
  recipientSmsResendCount: number = 0

  /** When the recipient was told a cart is on its way; null until then. */
  @Property({ fieldName: 'recipient_announced_at', type: 'Date', nullable: true })
  recipientAnnouncedAt?: Date | null

  /** Last hand-over code texted to the recipient: the same code is never sent twice. */
  @Property({ fieldName: 'recipient_code_sent', type: 'string', length: 4, nullable: true })
  recipientCodeSent?: string | null

  /** When the recipient was told the cart is cancelled. */
  @Property({ fieldName: 'recipient_cancel_sent_at', type: 'Date', nullable: true })
  recipientCancelSentAt?: Date | null

  /** IANA time zone of the payer's device, to tell them the hand-over time in their own hour. */
  @Property({ fieldName: 'payer_time_zone', type: 'string', length: 64, nullable: true })
  payerTimeZone?: string | null

  /**
   * Currency the payer saw. The amount collected is always the FCFA total;
   * the rate (margin included), the margin and the displayed total are frozen
   * here so the order shows what was agreed, whatever the rates do next.
   */
  @Property({ fieldName: 'display_currency', type: 'string', length: 3, default: 'XOF' })
  displayCurrency: string = 'XOF'

  @Property({ fieldName: 'fx_rate', type: 'double', columnType: 'numeric(14,6)', nullable: true })
  fxRate?: number | null

  @Property({ fieldName: 'fx_margin_bps', type: 'smallint', nullable: true })
  fxMarginBps?: number | null

  @Property({ fieldName: 'display_total', type: 'double', columnType: 'numeric(12,2)', nullable: true })
  displayTotal?: number | null

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  /** Delivered to someone other than the payer. Not mapped: derived from the phone. */
  get isGift(): boolean {
    return Boolean(this.recipientPhone)
  }
}
