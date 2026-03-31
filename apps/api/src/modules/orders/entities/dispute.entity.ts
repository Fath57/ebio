import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, ManyToOne, OneToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { Order } from './order.entity'

export enum DisputeStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
  REJECTED = 'REJECTED',
}

@Entity({ tableName: 'disputes' })
export class Dispute {
  [OptionalProps]?: 'id' | 'status' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @OneToOne(() => Order, { fieldName: 'order_id', owner: true })
  order!: Rel<Order>

  @ManyToOne(() => User, { fieldName: 'opened_by' })
  openedBy!: Rel<User>

  @Property({ type: 'text' })
  reason!: string

  @Enum({ items: () => DisputeStatus, default: DisputeStatus.OPEN })
  status: DisputeStatus = DisputeStatus.OPEN

  @Property({ fieldName: 'admin_notes', type: 'text', nullable: true })
  adminNotes?: string

  @Property({ fieldName: 'resolved_at', nullable: true })
  resolvedAt?: Date

  @ManyToOne(() => User, { fieldName: 'resolved_by', nullable: true })
  resolvedBy?: Rel<User>

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()
}
