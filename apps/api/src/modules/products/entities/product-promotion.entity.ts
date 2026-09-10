import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, Index, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { Supplier } from '../../suppliers/supplier.entity'
import { Product } from './product.entity'

export enum PromotionType {
  /** Unit price replaced by promoPrice. */
  PRICE = 'PRICE',
  /** Every buyQty units bought add getQty units free. */
  BOGO = 'BOGO',
  /** Delivery is free for the buyer on any order holding this product. */
  FREE_DELIVERY = 'FREE_DELIVERY',
}

/** Who created the promotion, hence who pays for it. */
export enum PromotionAuthor {
  SUPPLIER = 'SUPPLIER',
  PLATFORM = 'PLATFORM',
}

@Entity({ tableName: 'product_promotions' })
@Index({ properties: ['product', 'isActive'] })
export class ProductPromotion {
  [OptionalProps]?: 'id' | 'startsAt' | 'isActive' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => Product, { fieldName: 'product_id', deleteRule: 'cascade' })
  product!: Rel<Product>

  @ManyToOne(() => Supplier, { fieldName: 'supplier_id', deleteRule: 'cascade' })
  supplier!: Rel<Supplier>

  @Enum({ items: () => PromotionAuthor, fieldName: 'created_by' })
  createdBy!: PromotionAuthor

  @Enum({ items: () => PromotionType })
  type!: PromotionType

  @Property({ fieldName: 'promo_price', type: 'float', nullable: true })
  promoPrice?: number | null

  @Property({ fieldName: 'buy_qty', type: 'int', nullable: true })
  buyQty?: number | null

  @Property({ fieldName: 'get_qty', type: 'int', nullable: true })
  getQty?: number | null

  @Property({ fieldName: 'starts_at', type: 'Date' })
  startsAt: Date = new Date()

  /** Null = until removed. */
  @Property({ fieldName: 'ends_at', type: 'Date', nullable: true })
  endsAt?: Date | null

  @Property({ fieldName: 'is_active', default: true })
  isActive: boolean = true

  @Property({ fieldName: 'created_at', type: 'Date' })
  createdAt: Date = new Date()

  isLive(now = new Date()): boolean {
    return this.isActive && this.startsAt <= now && (!this.endsAt || this.endsAt > now)
  }
}
