import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { Supplier } from '../../suppliers/supplier.entity'
import { SubscriptionPlan } from './subscription-plan.entity'

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

@Entity({ tableName: 'subscriptions' })
export class Subscription {
  [OptionalProps]?: 'id' | 'status' | 'startDate' | 'autoRenew' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => Supplier, { fieldName: 'supplier_id' })
  supplier!: Rel<Supplier>

  @ManyToOne(() => SubscriptionPlan, { fieldName: 'plan_id' })
  plan!: Rel<SubscriptionPlan>

  @Enum({ items: () => SubscriptionStatus, default: SubscriptionStatus.ACTIVE })
  status: SubscriptionStatus = SubscriptionStatus.ACTIVE

  @Property({ fieldName: 'start_date' })
  startDate: Date = new Date()

  @Property({ fieldName: 'end_date' })
  endDate!: Date

  @Property({ fieldName: 'auto_renew', default: true })
  autoRenew: boolean = true

  @Property({ fieldName: 'payment_id', nullable: true })
  paymentId?: string

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
