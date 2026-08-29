import type { Rel } from '@mikro-orm/core'
import {
  Entity,
  Enum,
  Index,
  ManyToOne,
  OneToOne,
  OptionalProps,
  PrimaryKey,
  Property,
} from '@mikro-orm/core'
import { Order } from '../../orders/entities/order.entity'
import { CourierProfile } from './courier-profile.entity'

/**
 * Delivery lifecycle is deliberately separate from OrderStatus: published
 * mobile apps only ever see the existing order statuses, while the courier
 * granularity (offers, claim, failure, reassignment) lives here.
 */
export enum DeliveryStatus {
  AWAITING_COURIER = 'AWAITING_COURIER',
  ACCEPTED = 'ACCEPTED',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  /** Terminal: order cancelled or supplier self-delivered. */
  CANCELLED = 'CANCELLED',
}

export enum DeliveryProofType {
  CODE = 'CODE',
  PHOTO = 'PHOTO',
}

export enum DeliveryFailReason {
  CUSTOMER_ABSENT = 'CUSTOMER_ABSENT',
  ADDRESS_NOT_FOUND = 'ADDRESS_NOT_FOUND',
  CUSTOMER_REFUSED = 'CUSTOMER_REFUSED',
  OTHER = 'OTHER',
}

@Entity({ tableName: 'deliveries' })
export class Delivery {
  [OptionalProps]?: 'id' | 'status' | 'reassignmentCount' | 'broadcastRadiusKm' | 'deliveryFee' | 'courierFee' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @OneToOne(() => Order, { fieldName: 'order_id', owner: true, unique: true })
  order!: Rel<Order>

  /** Null until a courier wins the atomic claim (WHERE courier_id IS NULL). */
  @ManyToOne(() => CourierProfile, { fieldName: 'courier_id', nullable: true })
  courier?: Rel<CourierProfile> | null

  @Enum({ items: () => DeliveryStatus, default: DeliveryStatus.AWAITING_COURIER })
  @Index()
  status: DeliveryStatus = DeliveryStatus.AWAITING_COURIER

  /** Supplier address snapshotted at creation — later shop edits must not rewrite it. */
  @Property({ fieldName: 'pickup_address' })
  pickupAddress!: string

  /**
   * Pickup point snapshot, written via raw SQL. Null when the supplier has no
   * location: broadcast then targets every available courier, distance-free.
   */
  @Property({ columnType: 'geography(Point, 4326)', fieldName: 'pickup_location', nullable: true })
  @Index({ type: 'GiST' })
  pickupLocation?: string

  // Plain copies of pickupLocation for the tracking map (no PostGIS needed to read).
  @Property({ fieldName: 'pickup_latitude', type: 'float', nullable: true })
  pickupLatitude?: number

  @Property({ fieldName: 'pickup_longitude', type: 'float', nullable: true })
  pickupLongitude?: number

  @Property({ fieldName: 'dropoff_address' })
  dropoffAddress!: string

  /** 4-digit code generated at pickup, shown to the buyer only. */
  @Property({ fieldName: 'confirmation_code', length: 4, nullable: true })
  confirmationCode?: string

  @Enum({ items: () => DeliveryProofType, fieldName: 'proof_type', nullable: true })
  proofType?: DeliveryProofType

  @Property({ fieldName: 'proof_media_id', nullable: true })
  proofMediaId?: string

  @Enum({ items: () => DeliveryFailReason, fieldName: 'fail_reason', nullable: true })
  failReason?: DeliveryFailReason

  @Property({ fieldName: 'fail_comment', nullable: true })
  failComment?: string

  @Property({ fieldName: 'offered_at' })
  offeredAt: Date = new Date()

  @Property({ fieldName: 'accepted_at', nullable: true })
  acceptedAt?: Date

  @Property({ fieldName: 'picked_up_at', nullable: true })
  pickedUpAt?: Date

  @Property({ fieldName: 'in_transit_at', nullable: true })
  inTransitAt?: Date

  @Property({ fieldName: 'delivered_at', nullable: true })
  deliveredAt?: Date

  @Property({ fieldName: 'failed_at', nullable: true })
  failedAt?: Date

  @Property({ fieldName: 'reassignment_count', default: 0 })
  reassignmentCount: number = 0

  /**
   * Buyer-paid delivery fee snapshotted from the order at creation. Split
   * between the courier (`courierFee`) and eBio when a platform courier
   * completes the run; irrelevant on a supplier self-delivery.
   */
  @Property({ fieldName: 'delivery_fee', type: 'float', default: 0 })
  deliveryFee: number = 0

  /**
   * The courier's share of `deliveryFee`, computed with the platform rate in
   * force at creation (see computeCourierFee). Integer FCFA. Legacy rows
   * created before the courier wallet keep 0.
   */
  @Property({ fieldName: 'courier_fee', type: 'float', default: 0 })
  courierFee: number = 0

  /** Current broadcast radius, widened by the rebroadcast cron up to 25 km. */
  @Property({ fieldName: 'broadcast_radius_km', type: 'float', default: 5 })
  broadcastRadiusKm: number = 5

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
