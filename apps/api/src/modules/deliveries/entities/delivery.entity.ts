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
import { DeliveryRun } from './delivery-run.entity'
import { DispatchPhase } from './dispatch-phase.enum'

// Re-exported so existing importers keep working.
export { DispatchPhase }

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
  /** Delivery to a relative: code, photo and position together. */
  CODE_AND_PHOTO = 'CODE_AND_PHOTO',
}

export enum DeliveryFailReason {
  CUSTOMER_ABSENT = 'CUSTOMER_ABSENT',
  ADDRESS_NOT_FOUND = 'ADDRESS_NOT_FOUND',
  CUSTOMER_REFUSED = 'CUSTOMER_REFUSED',
  OTHER = 'OTHER',
}

/**
 * Why the run exists. STANDARD: a shop's order to its buyer. EXPORT_COLLECTION
 * (011): a terroir order carried from the shop to the eBio consolidation
 * point, paid by eBio from its EXPORT account, confirmed with the hub's code.
 */
export enum DeliveryPurpose {
  STANDARD = 'STANDARD',
  EXPORT_COLLECTION = 'EXPORT_COLLECTION',
}

/** The eBio hub as it was when the collection was offered. */
export interface ExportHubSnapshot {
  name: string
  address: string
  phone: string | null
  hours: string | null
}

@Entity({ tableName: 'deliveries' })
export class Delivery {
  [OptionalProps]?: 'id' | 'purpose' | 'status' | 'proofFar' | 'reassignmentCount' | 'broadcastRadiusKm' | 'deliveryFee' | 'courierFee' | 'tipAmount' | 'dispatchPhase' | 'offerRound' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @OneToOne(() => Order, { fieldName: 'order_id', owner: true, unique: true })
  order!: Rel<Order>

  /**
   * The run grouping this delivery. Null across the history and on
   * any delivery born from a lone order.
   */
  @Index()
  @ManyToOne(() => DeliveryRun, { fieldName: 'delivery_run_id', nullable: true })
  deliveryRun?: Rel<DeliveryRun>

  @Enum({ items: () => DeliveryPurpose, columnType: 'varchar(20)', default: DeliveryPurpose.STANDARD })
  purpose: DeliveryPurpose = DeliveryPurpose.STANDARD

  /**
   * The terroir parcel an EXPORT_COLLECTION run feeds (`export_shipments.id`).
   * A plain uuid: the deliveries module does not depend on the terroir one.
   */
  @Index()
  @Property({ fieldName: 'export_shipment_id', type: 'uuid', nullable: true })
  exportShipmentId?: string | null

  /** Hub name, address and contacts snapshotted for an EXPORT_COLLECTION run. */
  @Property({ fieldName: 'export_hub', type: 'json', columnType: 'jsonb', nullable: true })
  exportHub?: ExportHubSnapshot | null

  /**
   * Drop-off point of a run that does not end at the buyer's (the eBio hub).
   * Null on STANDARD runs: the order's delivery point applies.
   */
  @Property({ fieldName: 'dropoff_latitude', type: 'double', nullable: true })
  dropoffLatitude?: number | null

  @Property({ fieldName: 'dropoff_longitude', type: 'double', nullable: true })
  dropoffLongitude?: number | null

  /** Null until a courier wins the atomic claim (WHERE courier_id IS NULL). */
  @ManyToOne(() => CourierProfile, { fieldName: 'courier_id', nullable: true })
  courier?: Rel<CourierProfile> | null

  @Enum({ items: () => DeliveryStatus, default: DeliveryStatus.AWAITING_COURIER })
  @Index()
  status: DeliveryStatus = DeliveryStatus.AWAITING_COURIER

  /** Supplier address snapshotted at creation, later shop edits must not rewrite it. */
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

  /**
   * 4-digit code generated at pickup, shown to the buyer only. On an
   * EXPORT_COLLECTION run: the hub's 6-digit code, drawn at creation and
   * shown in the back office only.
   */
  @Property({ fieldName: 'confirmation_code', length: 6, nullable: true })
  confirmationCode?: string

  @Enum({ items: () => DeliveryProofType, fieldName: 'proof_type', nullable: true })
  proofType?: DeliveryProofType

  @Property({ fieldName: 'proof_media_id', nullable: true })
  proofMediaId?: string

  /** Courier position when the hand-over photo was taken. */
  @Property({ fieldName: 'proof_latitude', type: 'double', nullable: true })
  proofLatitude?: number | null

  @Property({ fieldName: 'proof_longitude', type: 'double', nullable: true })
  proofLongitude?: number | null

  /** When the photo was taken, replayed as is when the courier was offline. */
  @Property({ fieldName: 'proof_taken_at', type: 'Date', nullable: true })
  proofTakenAt?: Date | null

  /** Distance in metres from the proof position to the delivery point. */
  @Property({ fieldName: 'proof_distance_m', type: 'integer', nullable: true })
  proofDistanceM?: number | null

  /** Taken more than 300 m from the delivery point: flagged for support. */
  @Property({ fieldName: 'proof_far', type: 'boolean', default: false })
  proofFar: boolean = false

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

  /** Tip left by the buyer after delivery (integer FCFA), 0 when none. */
  @Property({ fieldName: 'tip_amount', type: 'float', default: 0 })
  tipAmount: number = 0

  @Enum({ items: () => DispatchPhase, fieldName: 'dispatch_phase', default: DispatchPhase.BROADCAST })
  dispatchPhase: DispatchPhase = DispatchPhase.BROADCAST

  /** Number of targeted offers made so far (see DispatchService.TARGETED_ROUNDS). */
  @Property({ fieldName: 'offer_round', type: 'int', default: 0 })
  offerRound: number = 0

  /** Courier currently holding the exclusive offer, until offerExpiresAt. */
  @ManyToOne(() => CourierProfile, { fieldName: 'offered_to_courier_id', nullable: true })
  offeredToCourier?: Rel<CourierProfile> | null

  @Property({ fieldName: 'offer_expires_at', type: 'Date', nullable: true })
  offerExpiresAt?: Date | null

  /** When the shop expects the parcel to be ready (from the declared prep time). */
  @Property({ fieldName: 'pickup_ready_at', type: 'Date', nullable: true })
  pickupReadyAt?: Date | null

  /** When the courier search is due to start (a lead before pickupReadyAt). */
  @Property({ fieldName: 'dispatch_at', type: 'Date', nullable: true })
  dispatchAt?: Date | null

  /** Reminder sent to the courier before the run is taken back; cleared on release. */
  @Property({ fieldName: 'pickup_warned_at', type: 'Date', nullable: true })
  pickupWarnedAt?: Date | null

  @Property({ fieldName: 'dispatch_started_at', type: 'Date', nullable: true })
  dispatchStartedAt?: Date | null

  /** Current broadcast radius, widened by the rebroadcast cron up to 25 km. */
  @Property({ fieldName: 'broadcast_radius_km', type: 'float', default: 5 })
  broadcastRadiusKm: number = 5

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
