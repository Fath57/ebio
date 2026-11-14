import type { Rel } from '@mikro-orm/core'
import { Entity, Index, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { ProductVariant } from '../../products/entities/product-variant.entity'
import { Product } from '../../products/entities/product.entity'
import { ExportPack } from './export-pack.entity'

/** One product of a pack, with its quantity. */
@Entity({ tableName: 'export_pack_items' })
@Index({ name: 'export_pack_items_product_idx', properties: ['product'] })
export class ExportPackItem {
  [OptionalProps]?: 'id'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Index({ name: 'export_pack_items_pack_idx' })
  @ManyToOne(() => ExportPack, { fieldName: 'pack_id', deleteRule: 'cascade' })
  pack!: Rel<ExportPack>

  @ManyToOne(() => Product, { fieldName: 'product_id' })
  product!: Rel<Product>

  @ManyToOne(() => ProductVariant, { fieldName: 'variant_id', nullable: true })
  variant?: Rel<ProductVariant> | null

  @Property({ type: 'integer' })
  quantity!: number
}
