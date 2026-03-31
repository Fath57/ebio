import { Entity, OptionalProps, PrimaryKey, Property, Unique } from '@mikro-orm/core'

@Entity({ tableName: 'categories' })
export class Category {
  [OptionalProps]?: 'id' | 'icon' | 'sortOrder' | 'imageUrl' | 'createdAt' | 'updatedAt'
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property()
  name!: string

  @Property()
  @Unique()
  slug!: string

  @Property({ default: '📦' })
  icon: string = '📦'

  @Property({ nullable: true })
  imageUrl?: string

  @Property({ fieldName: 'sort_order', default: 0 })
  sortOrder: number = 0

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
