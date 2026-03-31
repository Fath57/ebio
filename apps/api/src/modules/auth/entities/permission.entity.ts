import { Entity, OptionalProps, PrimaryKey, Property, Unique } from '@mikro-orm/core'

@Entity({ tableName: 'permissions' })
@Unique({ properties: ['action', 'subject'] })
export class Permission {
  [OptionalProps]?: 'id' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property()
  action!: string

  @Property()
  subject!: string

  @Property({ type: 'jsonb', nullable: true })
  conditions?: Record<string, unknown>

  @Property({ nullable: true })
  description?: string

  @Property({ fieldName: 'created_at' })
  createdAt: Date = new Date()
}
