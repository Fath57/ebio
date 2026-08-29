import type { Rel } from '@mikro-orm/core'
import {
  Entity,
  Enum,
  Index,
  ManyToOne,
  OptionalProps,
  PrimaryKey,
  Property,
} from '@mikro-orm/core'
import { Delivery } from './delivery.entity'

export enum DeliveryEventType {
  CREATED = 'CREATED',
  BROADCAST = 'BROADCAST',
  ACCEPTED = 'ACCEPTED',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  REASSIGNED = 'REASSIGNED',
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  /** Supplier advanced the order manually while the delivery was unclaimed. */
  SELF_DELIVERED = 'SELF_DELIVERED',
}

/** Append-only transition log — the traceable per-step history (SC-002). */
@Entity({ tableName: 'delivery_events' })
export class DeliveryEvent {
  [OptionalProps]?: 'id' | 'occurredAt' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => Delivery, { fieldName: 'delivery_id' })
  @Index()
  delivery!: Rel<Delivery>

  @Enum({ items: () => DeliveryEventType })
  type!: DeliveryEventType

  /** Courier/supplier/admin user id; null when the system (cron) acted. */
  @Property({ fieldName: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId?: string

  @Property({ type: 'jsonb', nullable: true })
  payload?: Record<string, unknown>

  /**
   * Real-world timestamp. May come from an offline courier replay, bounded
   * server-side: never in the future, never before the previous event.
   */
  @Property({ fieldName: 'occurred_at' })
  occurredAt: Date = new Date()

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()
}
