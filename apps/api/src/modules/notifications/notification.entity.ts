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
  ESCROW_REMINDER = 'ESCROW_REMINDER',
  PROMOTIONAL = 'PROMOTIONAL',
  SYSTEM = 'SYSTEM',
  DELIVERY_OFFER = 'DELIVERY_OFFER',
  DELIVERY_ASSIGNED = 'DELIVERY_ASSIGNED',
  DELIVERY_PICKED_UP = 'DELIVERY_PICKED_UP',
  DELIVERY_FAILED = 'DELIVERY_FAILED',
  DELIVERY_REASSIGNED = 'DELIVERY_REASSIGNED',
  COURIER_VALIDATED = 'COURIER_VALIDATED',
  COURIER_REJECTED = 'COURIER_REJECTED',
  COURIER_SUSPENDED = 'COURIER_SUSPENDED',
  /** Courier wallet settled after a completed run (earning or cash commission). */
  COURIER_EARNING = 'COURIER_EARNING',
  /** Courier payout number / withdrawal lifecycle. */
  COURIER_PAYOUT = 'COURIER_PAYOUT',
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
