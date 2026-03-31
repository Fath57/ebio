import type { Rel } from '@mikro-orm/core'
import { Entity, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { Product } from './product.entity'

@Entity({ tableName: 'product_variants' })
export class ProductVariant {
  [OptionalProps]?: 'id' | 'stock' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => Product, { fieldName: 'product_id' })
  product!: Rel<Product>

  @Property()
  label!: string

  @Property({ fieldName: 'price_per_unit', type: 'float' })
  pricePerUnit!: number

  @Property({ default: 0 })
  stock: number = 0

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
