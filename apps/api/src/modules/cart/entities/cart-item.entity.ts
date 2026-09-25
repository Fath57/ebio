import type { Rel } from '@mikro-orm/core'
import { Entity, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { Product } from '../../products/entities/product.entity'
import { Supplier } from '../../suppliers/supplier.entity'
import { Cart } from './cart.entity'

/**
 * One line of a basket.
 *
 * A row rather than a field of JSON, because the questions asked of it are
 * "which products get abandoned most?" and "what is in this basket?" — both
 * of which a JSON blob answers badly.
 *
 * The name and unit price are copies taken at the time. The product may be
 * renamed or repriced, and what the buyer put in their basket is what they
 * saw, not what the catalogue says today.
 */
@Entity({ tableName: 'cart_items' })
export class CartItem {
  [OptionalProps]?: 'id' | 'addedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => Cart, { fieldName: 'cart_id', deleteRule: 'cascade' })
  cart!: Rel<Cart>

  @ManyToOne(() => Product, { fieldName: 'product_id', deleteRule: 'cascade' })
  product!: Rel<Product>

  @ManyToOne(() => Supplier, { fieldName: 'supplier_id', deleteRule: 'cascade' })
  supplier!: Rel<Supplier>

  @Property({ fieldName: 'product_name', length: 200 })
  productName!: string

  @Property({ fieldName: 'unit_price' })
  unitPrice!: number

  @Property()
  quantity!: number

  @Property({ fieldName: 'added_at' })
  addedAt: Date = new Date()
}
