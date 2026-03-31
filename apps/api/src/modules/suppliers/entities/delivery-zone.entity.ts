import type { Rel } from '@mikro-orm/core'
import {
  Entity,
  Index,
  ManyToOne,
  OptionalProps,
  PrimaryKey,
  Property,

} from '@mikro-orm/core'
import { Supplier } from '../supplier.entity'

@Entity({ tableName: 'delivery_zones' })
export class DeliveryZone {
  [OptionalProps]?: 'id' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => Supplier, { fieldName: 'supplier_id' })
  supplier!: Rel<Supplier>

  @Property({ columnType: 'geography(Polygon, 4326)' })
  @Index({ type: 'GiST' })
  polygon!: string

  @Property({ fieldName: 'delivery_fee', type: 'float' })
  deliveryFee!: number

  @Property({ fieldName: 'estimated_minutes', type: 'int' })
  estimatedMinutes!: number

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
