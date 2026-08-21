import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { Supplier } from '../../suppliers/supplier.entity'

export enum PromoType {
  PERCENT = 'PERCENT',
  FIXED = 'FIXED',
}

/**
 * A discount code. Scope follows ownership: a supplier's code only applies to
 * that shop's orders and comes out of its revenue; a platform code (no
 * supplier) applies everywhere and eBio pays the shop back for the discount.
 */
@Entity({ tableName: 'promo_codes' })
export class PromoCode {
  [OptionalProps]?: 'id' | 'minOrderAmount' | 'maxUsesPerUser' | 'useCount' | 'isActive' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  /** Stored uppercase; matching is case-insensitive at the edges. */
  @Property({ length: 30 })
  code!: string

  @ManyToOne(() => Supplier, { fieldName: 'supplier_id', nullable: true, deleteRule: 'cascade' })
  supplier?: Rel<Supplier> | null

  @Enum({ items: () => PromoType })
  type!: PromoType

  /** PERCENT: 1–100. FIXED: FCFA amount. */
  @Property({ type: 'float' })
  value!: number

  /** Ceiling for PERCENT discounts; null = uncapped. */
  @Property({ fieldName: 'max_discount', type: 'float', nullable: true })
  maxDiscount?: number | null

  @Property({ fieldName: 'min_order_amount', type: 'float', default: 0 })
  minOrderAmount: number = 0

  @Property({ fieldName: 'starts_at', nullable: true })
  startsAt?: Date | null

  @Property({ fieldName: 'expires_at', nullable: true })
  expiresAt?: Date | null

  /** Global budget; null = unlimited. */
  @Property({ fieldName: 'max_uses', nullable: true })
  maxUses?: number | null

  @Property({ fieldName: 'max_uses_per_user', default: 1 })
  maxUsesPerUser: number = 1

  @Property({ fieldName: 'use_count', default: 0 })
  useCount: number = 0

  @Property({ fieldName: 'is_active', default: true })
  isActive: boolean = true

  @Property({ fieldName: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
