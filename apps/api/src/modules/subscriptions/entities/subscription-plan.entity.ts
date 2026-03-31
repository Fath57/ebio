import { Entity, OptionalProps, PrimaryKey, Property, Unique } from '@mikro-orm/core'

@Entity({ tableName: 'subscription_plans' })
export class SubscriptionPlan {
  [OptionalProps]?: 'id' | 'orderModeEnabled' | 'advancedAnalytics' | 'freeCommissionOrders' | 'maxMembers' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property()
  @Unique()
  name!: string // FREE, ESSENTIAL, PRO, COOPERATIVE

  @Property({ fieldName: 'price_monthly', type: 'int' })
  priceMonthly!: number

  @Property({ fieldName: 'max_products', nullable: true })
  maxProducts?: number // null = unlimited

  @Property({ fieldName: 'order_mode_enabled', default: false })
  orderModeEnabled: boolean = false

  @Property({ fieldName: 'advanced_analytics', default: false })
  advancedAnalytics: boolean = false

  @Property({ fieldName: 'free_commission_orders', default: 0 })
  freeCommissionOrders: number = 0

  @Property({ fieldName: 'max_members', default: 1 })
  maxMembers: number = 1

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
