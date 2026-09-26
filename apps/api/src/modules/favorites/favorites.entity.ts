import type { Rel } from '@mikro-orm/core'
import { Entity, ManyToOne, OptionalProps, PrimaryKey, Property, Unique } from '@mikro-orm/core'
import { User } from '../auth/auth.entity'
import { Product } from '../products/entities/product.entity'

/**
 * A product someone kept aside.
 *
 * The pair is unique: keeping the same product twice means nothing, and
 * letting it happen would show the same card twice in the list.
 */
@Entity({ tableName: 'favorites' })
@Unique({ properties: ['user', 'product'] })
export class Favorite {
  [OptionalProps]?: 'id' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => User, { fieldName: 'user_id', deleteRule: 'cascade' })
  user!: Rel<User>

  @ManyToOne(() => Product, { fieldName: 'product_id', deleteRule: 'cascade' })
  product!: Rel<Product>

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()
}
