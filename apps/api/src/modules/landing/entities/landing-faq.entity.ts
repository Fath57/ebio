import { Entity, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'

/** A question shown in the landing FAQ, managed from the backoffice. */
@Entity({ tableName: 'landing_faqs' })
export class LandingFaq {
  [OptionalProps]?: 'id' | 'isActive' | 'sortOrder' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ type: 'text' })
  question!: string

  @Property({ type: 'text' })
  answer!: string

  /** A draft or an outdated question is hidden, not deleted. */
  @Property({ fieldName: 'is_active', default: true })
  isActive: boolean = true

  @Property({ fieldName: 'sort_order', default: 0 })
  sortOrder: number = 0

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
