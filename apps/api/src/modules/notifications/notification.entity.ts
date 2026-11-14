import {
  Entity,
  Enum,
  ManyToOne,
  OptionalProps,
  PrimaryKey,
  Property,
} from '@mikro-orm/core'
import { User } from '../auth/auth.entity'

export enum NotificationType {
  ORDER_PLACED = 'ORDER_PLACED',
  ORDER_ACCEPTED = 'ORDER_ACCEPTED',
  ORDER_REJECTED = 'ORDER_REJECTED',
  ORDER_READY = 'ORDER_READY',
  ORDER_DELIVERED = 'ORDER_DELIVERED',
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  PAYMENT_RELEASED = 'PAYMENT_RELEASED',
  DISPUTE_OPENED = 'DISPUTE_OPENED',
  DISPUTE_RESOLVED = 'DISPUTE_RESOLVED',
  SUPPLIER_VALIDATED = 'SUPPLIER_VALIDATED',
  SUPPLIER_REJECTED = 'SUPPLIER_REJECTED',
  SUPPLIER_COMPLEMENT = 'SUPPLIER_COMPLEMENT',
  STOCK_ALERT = 'STOCK_ALERT',
  STOCK_AVAILABLE = 'STOCK_AVAILABLE',
  NEW_MESSAGE = 'NEW_MESSAGE',
  NEW_REVIEW = 'NEW_REVIEW',
  /** Invitation to review the products received, deferred after delivery. */
  PRODUCT_REVIEW_INVITE = 'PRODUCT_REVIEW_INVITE',
  /** The basket has not moved in a while; a nudge, capped in number. */
  CART_REMINDER = 'CART_REMINDER',
  ESCROW_REMINDER = 'ESCROW_REMINDER',
  PROMOTIONAL = 'PROMOTIONAL',
  SYSTEM = 'SYSTEM',
  DELIVERY_OFFER = 'DELIVERY_OFFER',
  DELIVERY_ASSIGNED = 'DELIVERY_ASSIGNED',
  DELIVERY_PICKED_UP = 'DELIVERY_PICKED_UP',
  DELIVERY_FAILED = 'DELIVERY_FAILED',
  DELIVERY_REASSIGNED = 'DELIVERY_REASSIGNED',
  /** The run will be taken back from the courier if not picked up soon. */
  DELIVERY_PICKUP_REMINDER = 'DELIVERY_PICKUP_REMINDER',
  /** The back office moved the delivery window of an order. */
  DELIVERY_WINDOW_CHANGED = 'DELIVERY_WINDOW_CHANGED',
  COURIER_VALIDATED = 'COURIER_VALIDATED',
  COURIER_REJECTED = 'COURIER_REJECTED',
  COURIER_SUSPENDED = 'COURIER_SUSPENDED',
  /** Courier wallet settled after a completed run (earning or cash commission). */
  COURIER_EARNING = 'COURIER_EARNING',
  /** Courier payout number / withdrawal lifecycle. */
  COURIER_PAYOUT = 'COURIER_PAYOUT',
  /** A buyer rated the courier's run. */
  COURIER_RATED = 'COURIER_RATED',
  /** A buyer tipped the courier; the wallet is already credited. */
  COURIER_TIP = 'COURIER_TIP',
  /** Referral rewarded: both wallets have just been credited. */
  REFERRAL_REWARD = 'REFERRAL_REWARD',
  /** Sponsored banner request reviewed by eBio. */
  BANNER_APPROVED = 'BANNER_APPROVED',
  BANNER_REJECTED = 'BANNER_REJECTED',
  /** A cart sent to a relative was handed over; the push carries the photo. */
  GIFT_DELIVERED = 'GIFT_DELIVERED',
  /** A cart sent to a relative could not be handed over; the wallet is credited. */
  GIFT_DELIVERY_FAILED = 'GIFT_DELIVERY_FAILED',
  /** Family wallet topped up; members are told what they may spend. */
  FAMILY_WALLET_TOPUP = 'FAMILY_WALLET_TOPUP',
  /** A member paid an order from the family wallet; told to the payer. */
  FAMILY_WALLET_PURCHASE = 'FAMILY_WALLET_PURCHASE',
  /** The family wallet went below the payer's threshold. */
  FAMILY_WALLET_LOW_BALANCE = 'FAMILY_WALLET_LOW_BALANCE',
  /** A pending member proved their number and joined. */
  FAMILY_WALLET_MEMBER_JOINED = 'FAMILY_WALLET_MEMBER_JOINED',
  /** A member still pending after 30 days. */
  FAMILY_WALLET_MEMBER_PENDING = 'FAMILY_WALLET_MEMBER_PENDING',
  /** A member's access changed: added, suspended, resumed, removed, closed. */
  FAMILY_WALLET_STATUS = 'FAMILY_WALLET_STATUS',
  /** A terroir parcel moved a step, or eBio left a message on it. */
  EXPORT_SHIPMENT_UPDATE = 'EXPORT_SHIPMENT_UPDATE',
  /** A departure opened towards a country the buyer asked to be told about. */
  EXPORT_DEPARTURE_OPEN = 'EXPORT_DEPARTURE_OPEN',
  /** 48 h left before the deadline of the departure an unpaid preview picked. */
  EXPORT_DEADLINE_REMINDER = 'EXPORT_DEADLINE_REMINDER',
  /** The parcel weighs more than estimated, beyond the tolerance. */
  EXPORT_WEIGHT_SUPPLEMENT = 'EXPORT_WEIGHT_SUPPLEMENT',
  /** eBio approved or refused a shop's product or pack for export. */
  EXPORT_PRODUCT_REVIEWED = 'EXPORT_PRODUCT_REVIEWED',
  /** A departure reached 80 % of its capacity; told to the team. */
  EXPORT_DEPARTURE_FILL = 'EXPORT_DEPARTURE_FILL',
}

export enum NotificationChannel {
  PUSH = 'PUSH',
  SMS = 'SMS',
  IN_APP = 'IN_APP',
}

@Entity({ tableName: 'notifications' })
export class Notification {
  [OptionalProps]?: 'id' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => User, { fieldName: 'userId' })
  user!: User

  @Enum({ items: () => NotificationType })
  type!: NotificationType

  @Property()
  title!: string

  @Property({ type: 'text' })
  body!: string

  @Property({ type: 'jsonb', nullable: true })
  data?: Record<string, unknown>

  @Enum({ items: () => NotificationChannel })
  channel!: NotificationChannel

  @Property({ fieldName: 'readAt', nullable: true })
  readAt?: Date

  @Property({ fieldName: 'sentAt', nullable: true })
  sentAt?: Date

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()
}
