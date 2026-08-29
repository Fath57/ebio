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
import { User } from '../../auth/auth.entity'
import { CourierProfile } from '../../deliveries/entities/courier-profile.entity'
import { Supplier } from '../../suppliers/supplier.entity'

/**
 * Who the buyer is talking to. SUPPLIER threads are one per buyer↔shop pair;
 * COURIER threads are one per delivery, between the buyer and the courier
 * assigned to it.
 */
export enum ConversationKind {
  SUPPLIER = 'SUPPLIER',
  COURIER = 'COURIER',
}

@Entity({ tableName: 'conversations' })
@Index({ properties: ['buyer', 'lastMessageAt'] })
@Index({ properties: ['supplier', 'lastMessageAt'] })
export class Conversation {
  [OptionalProps]?: 'id' | 'kind' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Enum({ items: () => ConversationKind, default: ConversationKind.SUPPLIER, length: 16 })
  kind: ConversationKind = ConversationKind.SUPPLIER

  @ManyToOne(() => User, { fieldName: 'buyer_id' })
  buyer!: Rel<User>

  /** Set on SUPPLIER threads only. */
  @ManyToOne(() => Supplier, { fieldName: 'supplier_id', nullable: true })
  supplier?: Rel<Supplier> | null

  /** Set on COURIER threads only, together with `deliveryId`. */
  @ManyToOne(() => CourierProfile, { fieldName: 'courier_profile_id', nullable: true })
  courier?: Rel<CourierProfile> | null

  /** The delivery a COURIER thread is about — one thread per delivery. */
  @Property({ fieldName: 'delivery_id', type: 'uuid', nullable: true })
  deliveryId?: string

  @Property({ fieldName: 'order_id', type: 'uuid', nullable: true })
  orderId?: string

  @Property({ fieldName: 'last_message_at', nullable: true })
  lastMessageAt?: Date

  @Property({ fieldName: 'archived_at', nullable: true })
  archivedAt?: Date

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
