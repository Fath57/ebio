import type { Rel } from '@mikro-orm/core'
import {
  Entity,
  ManyToOne,
  OptionalProps,
  PrimaryKey,
  Property,

  Unique,
} from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { Product } from './product.entity'

@Entity({ tableName: 'stock_alerts' })
@Unique({ properties: ['buyer', 'product'] })
export class StockAlert {
  [OptionalProps]?: 'id' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => User, { fieldName: 'buyer_id' })
  buyer!: Rel<User>

  @ManyToOne(() => Product, { fieldName: 'product_id' })
  product!: Rel<Product>

  @Property({ fieldName: 'notified_at', nullable: true })
  notifiedAt?: Date

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()
}
