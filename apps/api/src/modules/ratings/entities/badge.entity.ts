import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { Supplier } from '../../suppliers/supplier.entity'

export enum BadgeType {
  VALIDATED = 'VALIDATED',
  TOP_SELLER = 'TOP_SELLER',
  CERTIFIED_BIO = 'CERTIFIED_BIO',
}

@Entity({ tableName: 'badges' })
export class Badge {
  [OptionalProps]?: 'id' | 'grantedAt' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => Supplier, { fieldName: 'supplier_id' })
  supplier!: Rel<Supplier>

  @Enum({ items: () => BadgeType })
  type!: BadgeType

  @Property({ fieldName: 'granted_at' })
  grantedAt: Date = new Date()

  @Property({ fieldName: 'granted_by', nullable: true })
  grantedBy?: string

  @Property({ fieldName: 'expires_at', nullable: true })
  expiresAt?: Date

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()
}
