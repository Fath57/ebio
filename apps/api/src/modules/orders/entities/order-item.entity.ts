import type { Rel } from '@mikro-orm/core'
import { Entity, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { ProductPromotion } from '../../products/entities/product-promotion.entity'
import { ProductVariant } from '../../products/entities/product-variant.entity'
import { Product } from '../../products/entities/product.entity'
import { Order } from './order.entity'

@Entity({ tableName: 'order_items' })
export class OrderItem {
  [OptionalProps]?: 'isGift'

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

  /** Promotion that shaped this line (price cut, or the gift it produced). */
  @ManyToOne(() => ProductPromotion, { fieldName: 'promotion_id', nullable: true })
  promotion?: Rel<ProductPromotion> | null

  /** Free units added by a buy-X-get-Y promotion: unitPrice 0. */
  @Property({ fieldName: 'is_gift', default: false })
  isGift: boolean = false
}
