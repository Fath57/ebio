import type { Rel } from '@mikro-orm/core'
import { Collection, Entity, Enum, Index, ManyToOne, OneToMany, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { Checkout } from '../../payments/entities/checkout.entity'
import { CourierProfile } from './courier-profile.entity'
import { Delivery } from './delivery.entity'
import { DispatchPhase } from './dispatch-phase.enum'

/**
 * A run: the deliveries of one checkout, handed to a single courier who
 * collects from every shop then hands over once.
 *
 * Each `Delivery` stays 1-1 with its order — status, events and proof of
 * handover do not move, and neither do the supplier screens. It is the run
 * that becomes the unit of dispatch, acceptance and pay.
 */
export enum DeliveryRunStatus {
  AWAITING_COURIER = 'AWAITING_COURIER',
  /** 15 min unclaimed: the back-office may assign a courier by hand. */
  ESCALATED = 'ESCALATED',
  /** 30 min unclaimed: the buyer chooses between waiting and cancelling. */
  BUYER_DECISION = 'BUYER_DECISION',
  ACCEPTED = 'ACCEPTED',
  COLLECTING = 'COLLECTING',
  DELIVERING = 'DELIVERING',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

/** How the courier search ended. Kept for measurement. */
export enum DeliveryRunOutcome {
  ACCEPTED = 'ACCEPTED',
  REFUSED_ALL = 'REFUSED_ALL',
  UNSERVED = 'UNSERVED',
  CANCELLED = 'CANCELLED',
}

@Entity({ tableName: 'delivery_runs' })
export class DeliveryRun {
  [OptionalProps]?: 'id' | 'status' | 'pickupOrder' | 'supplierIds' | 'deliveryFee' | 'courierEarning' | 'dispatchPhase' | 'offerRound' | 'broadcastRadiusKm' | 'shopCount' | 'offersSent' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  /**
   * A cart yields as many runs as the grouping allows: past two shops, or past
   * the admitted gap between them, a second one is born. The link is therefore
   * no longer 1-1.
   */
  @Index()
  @ManyToOne(() => Checkout, { fieldName: 'checkout_id' })
  checkout!: Rel<Checkout>

  /**
   * The shops this run collects from. Filled at opening time, before any
   * delivery exists: it is what lets each delivery join the right run when its
   * order is born.
   */
  @Property({ fieldName: 'supplier_ids', type: 'jsonb' })
  supplierIds: string[] = []

  /** This run's fee. The cart carries their sum, not the breakdown. */
  @Property({ fieldName: 'delivery_fee', columnType: 'numeric(12,2)', default: 0 })
  deliveryFee: number = 0

  @Index()
  @ManyToOne(() => CourierProfile, { fieldName: 'courier_id', nullable: true })
  courier?: Rel<CourierProfile>

  @OneToMany(() => Delivery, delivery => delivery.deliveryRun)
  deliveries = new Collection<Delivery>(this)

  @Enum({ items: () => DeliveryRunStatus, default: DeliveryRunStatus.AWAITING_COURIER })
  status: DeliveryRunStatus = DeliveryRunStatus.AWAITING_COURIER

  /** Delivery ids, in the order the shops are visited. */
  @Property({ fieldName: 'pickup_order', type: 'jsonb' })
  pickupOrder: string[] = []

  /** Distance of the whole run, pickups included. */
  @Property({ fieldName: 'total_distance_km', type: 'double', nullable: true })
  totalDistanceKm?: number

  /** Pay for the run, and not per order carried. */
  @Property({ fieldName: 'courier_earning', columnType: 'numeric(12,2)', default: 0 })
  courierEarning: number = 0

  @Enum({ items: () => DispatchPhase, fieldName: 'dispatch_phase', default: DispatchPhase.TARGETED })
  dispatchPhase: DispatchPhase = DispatchPhase.TARGETED

  /*
   * Dispatch state, taken feature for feature from `Delivery`: the mechanism
   * does not change, only the object being dispatched does.
   */

  /**
   * First pickup point, written in raw SQL like every geographic access. Null
   * when no shop of the run has a position: the dispatch then targets every
   * available courier, with no distance criterion.
   */
  @Property({ columnType: 'geography(Point, 4326)', fieldName: 'pickup_location', nullable: true })
  pickupLocation?: string

  @Property({ fieldName: 'offer_round', type: 'int', default: 0 })
  offerRound: number = 0

  /** Courier holding the exclusive offer, until `offerExpiresAt`. */
  @ManyToOne(() => CourierProfile, { fieldName: 'offered_to_courier_id', nullable: true })
  offeredToCourier?: Rel<CourierProfile> | null

  @Property({ fieldName: 'offer_expires_at', type: 'Date', nullable: true })
  offerExpiresAt?: Date | null

  @Property({ fieldName: 'offered_at', type: 'Date', nullable: true })
  offeredAt?: Date | null

  @Property({ fieldName: 'dispatch_started_at', type: 'Date', nullable: true })
  dispatchStartedAt?: Date | null

  @Property({ fieldName: 'accepted_at', type: 'Date', nullable: true })
  acceptedAt?: Date | null

  @Property({ fieldName: 'collecting_at', type: 'Date', nullable: true })
  collectingAt?: Date | null

  @Property({ fieldName: 'delivering_at', type: 'Date', nullable: true })
  deliveringAt?: Date | null

  @Property({ fieldName: 'delivered_at', type: 'Date', nullable: true })
  deliveredAt?: Date | null

  /**
   * Four-digit handover code, drawn at the first pickup and shown to the
   * buyer. One for the whole run: the buyer receives once, and should not have
   * to recite one code per shop.
   */
  @Property({ fieldName: 'confirmation_code', length: 4, nullable: true })
  confirmationCode?: string | null

  /** Current broadcast radius, widened by the cron up to 25 km. */
  @Property({ fieldName: 'broadcast_radius_km', type: 'float', default: 5 })
  broadcastRadiusKm: number = 5

  @Property({ fieldName: 'escalated_at', nullable: true })
  escalatedAt?: Date

  @Property({ fieldName: 'buyer_prompted_at', nullable: true })
  buyerPromptedAt?: Date

  /*
   * Measurement. The grouping thresholds — two shops, 3 km apart — are set,
   * not guessed; these columns serve to tune them on facts rather than on a
   * hunch.
   */

  @Property({ fieldName: 'shop_count', default: 0 })
  shopCount: number = 0

  /** Gap between the two farthest pickups; null when a position is missing. */
  @Property({ fieldName: 'pickup_spread_km', type: 'double', nullable: true })
  pickupSpreadKm?: number

  @Property({ fieldName: 'offers_sent', default: 0 })
  offersSent: number = 0

  @Enum({ items: () => DeliveryRunOutcome, nullable: true })
  outcome?: DeliveryRunOutcome

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
