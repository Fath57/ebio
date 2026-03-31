import type { Rel } from '@mikro-orm/core'
import {
  Entity,
  Index,
  ManyToOne,
  OptionalProps,
  PrimaryKey,
  Property,

} from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { Supplier } from '../../suppliers/supplier.entity'

@Entity({ tableName: 'conversations' })
@Index({ properties: ['buyer', 'lastMessageAt'] })
@Index({ properties: ['supplier', 'lastMessageAt'] })
export class Conversation {
  [OptionalProps]?: 'id' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => User, { fieldName: 'buyer_id' })
  buyer!: Rel<User>

  @ManyToOne(() => Supplier, { fieldName: 'supplier_id' })
  supplier!: Rel<Supplier>

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
