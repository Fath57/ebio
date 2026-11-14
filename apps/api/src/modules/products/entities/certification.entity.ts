import { Entity, OptionalProps, PrimaryKey, Property, Unique } from '@mikro-orm/core'

/**
 * A label or certification a product can carry, Bio, Ecocert, Commerce
 * équitable… The list is the platform's, managed from the back office.
 *
 * `products.labels` keeps the codes rather than foreign keys, like
 * `products.unit`: a product must keep reading the same way whatever is later
 * done to this list. The code is the contract, this table only describes it.
 */
@Entity({ tableName: 'certifications' })
export class Certification {
  [OptionalProps]?: 'id' | 'description' | 'logoUrl' | 'isActive' | 'sortOrder' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  /** Written onto every product that carries it. Immutable once created. */
  @Property()
  @Unique()
  code!: string

  /** What buyers read: « Commerce équitable ». */
  @Property()
  name!: string

  /** What it guarantees, in a sentence; shown on the product page. */
  @Property({ type: 'text', nullable: true })
  description?: string | null

  @Property({ fieldName: 'logo_url', type: 'text', nullable: true })
  logoUrl?: string | null

  /** A retired one leaves the pickers but keeps naming the products that wear it. */
  @Property({ fieldName: 'is_active', default: true })
  isActive: boolean = true

  @Property({ fieldName: 'sort_order', default: 0 })
  sortOrder: number = 0

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
