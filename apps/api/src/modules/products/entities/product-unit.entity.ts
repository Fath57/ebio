import { Entity, OptionalProps, PrimaryKey, Property, Unique } from '@mikro-orm/core'

/**
 * A unit of sale a supplier can price a product in — kilogramme, litre, sachet…
 *
 * `products.unit` keeps the code rather than a foreign key. A product and the
 * orders that quote it must keep reading the same way for years, whatever an
 * admin later does to this list; the code is the contract, this table only
 * describes it.
 */
@Entity({ tableName: 'product_units' })
export class ProductUnit {
  [OptionalProps]?: 'id' | 'isActive' | 'sortOrder' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  /** Written onto every product. Immutable once created, never translated. */
  @Property()
  @Unique()
  code!: string

  /** Full name, what the pickers show: « Kilogramme ». */
  @Property()
  label!: string

  /** Short form appended to a price: « 1 200 FCFA / kg ». */
  @Property({ fieldName: 'short_label' })
  shortLabel!: string

  /**
   * A retired unit disappears from the pickers but keeps naming the products
   * that already use it — which is why a unit is deactivated, not deleted.
   */
  @Property({ fieldName: 'is_active', default: true })
  isActive: boolean = true

  @Property({ fieldName: 'sort_order', default: 0 })
  sortOrder: number = 0

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
