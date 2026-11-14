import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, Index, ManyToOne, OneToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { Checkout } from '../../payments/entities/checkout.entity'
import { ExportReception, ExportShipmentStatus, ExportSupplementStatus } from '../contracts/terroir.contract'
import { ExportDeparture } from './export-departure.entity'
import { ExportPickupPoint } from './export-pickup-point.entity'

/**
 * A terroir parcel (011): one per terroir checkout, grouping the EXPORT
 * orders of several shops for one buyer, one departure, one destination.
 *
 * It carries the shipping, home delivery and insurance, frozen at payment,
 * so that none of it ever sits in an order's `deliveryFee`, which would be
 * paid out to the shop. `status` is the current step, denormalised from the
 * events.
 */
@Entity({ tableName: 'export_shipments' })
@Index({ name: 'export_shipments_departure_idx', properties: ['departure', 'status'] })
@Index({ name: 'export_shipments_buyer_idx', properties: ['buyer', 'createdAt'] })
export class ExportShipment {
  [OptionalProps]?: 'id' | 'reception' | 'homeDeliveryFee' | 'insured' | 'insurancePrice' | 'status' | 'supplementStatus' | 'removedItemIds' | 'removedOrderIds' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @OneToOne(() => Checkout, { owner: true, fieldName: 'checkout_id', unique: 'export_shipments_checkout_id_unique' })
  checkout!: Rel<Checkout>

  @ManyToOne(() => User, { fieldName: 'buyer_id' })
  buyer!: Rel<User>

  @ManyToOne(() => ExportDeparture, { fieldName: 'departure_id' })
  departure!: Rel<ExportDeparture>

  /** References `export_countries.code`. */
  @Property({ type: 'string', length: 2, columnType: 'varchar(2)' })
  country!: string

  @Enum({ items: () => ExportReception, columnType: 'varchar(8)', default: ExportReception.PICKUP })
  reception: ExportReception = ExportReception.PICKUP

  @ManyToOne(() => ExportPickupPoint, { fieldName: 'pickup_point_id', nullable: true })
  pickupPoint?: Rel<ExportPickupPoint> | null

  @Property({ fieldName: 'home_address', type: 'text', nullable: true })
  homeAddress?: string | null

  @Property({ fieldName: 'estimated_weight_g', type: 'integer' })
  estimatedWeightG!: number

  @Property({ fieldName: 'actual_weight_g', type: 'integer', nullable: true })
  actualWeightG?: number | null

  /** Frozen at payment (FR-013), as are the next three. */
  @Property({ fieldName: 'price_per_kg', columnType: 'numeric(12,2)' })
  pricePerKg!: string

  @Property({ fieldName: 'min_billed_kg', columnType: 'numeric(6,2)' })
  minBilledKg!: string

  @Property({ fieldName: 'shipping_price', columnType: 'numeric(12,2)' })
  shippingPrice!: string

  @Property({ fieldName: 'home_delivery_fee', columnType: 'numeric(12,2)', default: '0' })
  homeDeliveryFee: string = '0'

  @Property({ type: 'boolean', default: false })
  insured: boolean = false

  @Property({ fieldName: 'insurance_price', columnType: 'numeric(12,2)', default: '0' })
  insurancePrice: string = '0'

  /** Value of the products, declared to the agency. */
  @Property({ fieldName: 'declared_value', columnType: 'numeric(12,2)' })
  declaredValue!: string

  @Property({ fieldName: 'gift_recipient_name', type: 'string', length: 120, nullable: true })
  giftRecipientName?: string | null

  @Property({ fieldName: 'gift_recipient_email', type: 'string', length: 200, nullable: true })
  giftRecipientEmail?: string | null

  @Property({ fieldName: 'gift_recipient_phone', type: 'string', length: 20, nullable: true })
  giftRecipientPhone?: string | null

  @Property({ fieldName: 'gift_message', type: 'string', length: 300, nullable: true })
  giftMessage?: string | null

  @Enum({ items: () => ExportShipmentStatus, columnType: 'varchar(20)', default: ExportShipmentStatus.PENDING_PAYMENT })
  status: ExportShipmentStatus = ExportShipmentStatus.PENDING_PAYMENT

  @Enum({ items: () => ExportSupplementStatus, fieldName: 'supplement_status', columnType: 'varchar(12)', default: ExportSupplementStatus.NONE })
  supplementStatus: ExportSupplementStatus = ExportSupplementStatus.NONE

  @Property({ fieldName: 'supplement_amount', columnType: 'numeric(12,2)', nullable: true })
  supplementAmount?: string | null

  @Property({ fieldName: 'supplement_requested_at', type: 'Date', nullable: true })
  supplementRequestedAt?: Date | null

  /**
   * The wallet top-up opened to pay the supplement by card (INTRAM page):
   * once credited, the supplement is debited from that wallet.
   */
  @Property({ fieldName: 'supplement_topup_id', type: 'uuid', nullable: true })
  supplementTopupId?: string | null

  /**
   * Lines taken out of the parcel after their shop was paid (the buyer's
   * choice at weighing): they stay on the shop's order, not in the parcel.
   */
  @Property({ fieldName: 'removed_item_ids', type: 'json', columnType: 'jsonb', default: '[]' })
  removedItemIds: string[] = []

  /** Cancelled orders already deducted from the parcel: a replay deducts nothing. */
  @Property({ fieldName: 'removed_order_ids', type: 'json', columnType: 'jsonb', default: '[]' })
  removedOrderIds: string[] = []

  /** The « still waiting at the pickup point » reminder went out (FR-027). */
  @Property({ fieldName: 'pickup_reminded_at', type: 'Date', nullable: true })
  pickupRemindedAt?: Date | null

  /** Opaque token of the public tracking page of a gifted parcel, never shows a price. */
  @Property({ fieldName: 'tracking_token', type: 'string', length: 32, unique: 'export_shipments_tracking_token_unique' })
  trackingToken!: string

  @Property({ fieldName: 'created_at', type: 'Date' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updated_at', type: 'Date', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
