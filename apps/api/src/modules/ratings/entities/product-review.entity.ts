import type { Rel } from '@mikro-orm/core'
import { Entity, Index, ManyToOne, OneToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { OrderItem } from '../../orders/entities/order-item.entity'
import { Product } from '../../products/entities/product.entity'

/**
 * A buyer's rating of one product they received.
 *
 * It hangs off the order line rather than off the product: the line is the
 * only thing that proves who bought what, on which delivery. Making it unique
 * turns "one review per purchase" into a database constraint instead of a
 * check the code can forget. The same product ordered twice therefore earns
 * two reviews, one per delivery — deliberate for fresh produce, whose quality
 * varies from one crate to the next.
 */
@Entity({ tableName: 'product_reviews' })
@Index({ properties: ['product', 'isHidden', 'createdAt'] })
export class ProductReview {
  [OptionalProps]?: 'isHidden' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  /** The purchase this review is allowed by, and the reason it is unique. */
  @OneToOne(() => OrderItem, { fieldName: 'order_item_id', unique: true, owner: true })
  orderItem!: Rel<OrderItem>

  /**
   * Denormalised from the order line. Listing a product's reviews is the
   * hottest path of the feature; without this column every page would join
   * `order_items` to find its way back.
   */
  @ManyToOne(() => Product, { fieldName: 'product_id' })
  product!: Rel<Product>

  @ManyToOne(() => User, { fieldName: 'buyer_id' })
  @Index()
  buyer!: Rel<User>

  @Property({ type: 'smallint' })
  rating!: number

  @Property({ type: 'text', nullable: true })
  comment?: string

  /** Hidden by moderation: gone from the lists, and out of the average. */
  @Property({ fieldName: 'is_hidden' })
  isHidden: boolean = false

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()
}
