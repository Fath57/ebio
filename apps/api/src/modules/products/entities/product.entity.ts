import type { Rel } from '@mikro-orm/core'
import {
  Entity,
  Enum,
  Index,
  ManyToOne,
  OptionalProps,
  PrimaryKey,
  Property,

} from '@mikro-orm/core'
import { Supplier } from '../../suppliers/supplier.entity'
import { Category } from './category.entity'

export enum ProductStatus {
  ACTIVE = 'ACTIVE',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
  HIDDEN = 'HIDDEN',
}

export enum ProductUnit {
  KG = 'KG',
  LITER = 'LITER',
  SACHET = 'SACHET',
  PIECE = 'PIECE',
  LOT = 'LOT',
}

@Entity({ tableName: 'products' })
@Index({ properties: ['supplier', 'category', 'status'] })
export class Product {
  [OptionalProps]?: 'id' | 'photos' | 'stock' | 'stockAlertThreshold' | 'status' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => Supplier, { fieldName: 'supplier_id' })
  supplier!: Rel<Supplier>

  @ManyToOne(() => Category, { fieldName: 'category_id' })
  category!: Rel<Category>

  @Property()
  name!: string

  @Property({ type: 'text', nullable: true })
  description?: string

  @Property({ fieldName: 'voice_description_url', nullable: true })
  voiceDescriptionUrl?: string

  @Property({ type: 'jsonb', default: '[]' })
  photos: string[] = []

  @Property({ fieldName: 'price_per_unit', type: 'float' })
  pricePerUnit!: number

  @Enum({ items: () => ProductUnit })
  unit!: ProductUnit

  @Property({ default: 0 })
  stock: number = 0

  @Property({ fieldName: 'stock_alert_threshold', default: 5 })
  stockAlertThreshold: number = 5

  @Enum({ items: () => ProductStatus, default: ProductStatus.ACTIVE })
  status: ProductStatus = ProductStatus.ACTIVE

  @Property({ fieldName: 'promotional_price', type: 'float', nullable: true })
  promotionalPrice?: number

  @Property({ fieldName: 'promotion_expires_at', nullable: true })
  promotionExpiresAt?: Date

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
