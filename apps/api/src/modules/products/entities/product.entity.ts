import type { Rel } from '@mikro-orm/core'
import type { AllergenCode, LabelCode } from '../composition.constants'
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

/** Nutrition facts per 100 g / 100 ml, every entry optional. */
export interface NutritionalValues {
  /** Reference quantity; defaults to 100 g when absent (legacy rows). */
  basis?: '100g' | '100ml'
  energyKcal?: number
  fat?: number
  saturatedFat?: number
  carbohydrates?: number
  sugars?: number
  fiber?: number
  protein?: number
  salt?: number
}

@Entity({ tableName: 'products' })
@Index({ properties: ['supplier', 'category', 'status'] })
export class Product {
  [OptionalProps]?: 'id' | 'photos' | 'stock' | 'stockAlertThreshold' | 'status' | 'allergens' | 'labels' | 'createdAt' | 'updatedAt'

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

  /**
   * Code of a row in `product_units`. Kept as plain text rather than a foreign
   * key so the reference list can be reshaped from the backoffice without ever
   * rewriting a product or the orders that quote it.
   */
  @Property()
  unit!: string

  @Property({ default: 0 })
  stock: number = 0

  @Property({ fieldName: 'stock_alert_threshold', default: 5 })
  stockAlertThreshold: number = 5

  @Enum({ items: () => ProductStatus, default: ProductStatus.ACTIVE })
  status: ProductStatus = ProductStatus.ACTIVE

  // ===== Composition / product sheet =====

  /** Free-text ingredient list, as printed on the label. */
  @Property({ type: 'text', nullable: true })
  ingredients?: string

  /** Canonical allergen codes (see composition.constants.ts), GIN-indexed. */
  @Property({ type: 'jsonb', default: '[]' })
  allergens: AllergenCode[] = []

  /** Canonical label codes (e.g. `organic`, `ecocert`), GIN-indexed. */
  @Property({ type: 'jsonb', default: '[]' })
  labels: LabelCode[] = []

  /** Provenance (e.g. « Bénin, Atacora »). */
  @Property({ nullable: true })
  origin?: string

  /** Storage advice shown on the product page. */
  @Property({ type: 'text', nullable: true })
  conservation?: string

  @Property({ type: 'jsonb', fieldName: 'nutritional_values', nullable: true })
  nutritionalValues?: NutritionalValues

  @Property({ fieldName: 'promotional_price', type: 'float', nullable: true })
  promotionalPrice?: number

  @Property({ fieldName: 'promotion_expires_at', nullable: true })
  promotionExpiresAt?: Date

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
