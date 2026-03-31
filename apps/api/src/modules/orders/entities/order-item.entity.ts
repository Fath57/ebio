import type { Rel } from '@mikro-orm/core'
import { Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core'
import { ProductVariant } from '../../products/entities/product-variant.entity'
import { Product } from '../../products/entities/product.entity'
import { Order } from './order.entity'

@Entity({ tableName: 'order_items' })
export class OrderItem {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => Order, { fieldName: 'order_id' })
  order!: Rel<Order>

  @ManyToOne(() => Product, { fieldName: 'product_id' })
  product!: Rel<Product>

  @ManyToOne(() => ProductVariant, { fieldName: 'variant_id', nullable: true })
  variant?: Rel<ProductVariant>

  @Property()
  quantity!: number

  @Property({ fieldName: 'unit_price', type: 'float' })
  unitPrice!: number

  @Property({ fieldName: 'total_price', type: 'float' })
  totalPrice!: number
}
