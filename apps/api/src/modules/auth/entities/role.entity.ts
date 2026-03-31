import { Collection, Entity, ManyToMany, OptionalProps, PrimaryKey, Property, Unique } from '@mikro-orm/core'
import { Permission } from './permission.entity'

@Entity({ tableName: 'roles' })
export class Role {
  [OptionalProps]?: 'id' | 'isDefault' | 'permissions' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property()
  @Unique()
  name!: string

  @Property({ nullable: true })
  description?: string

  @Property({ default: false, fieldName: 'is_default' })
  isDefault: boolean = false

  @ManyToMany(() => Permission)
  permissions = new Collection<Permission>(this)

  @Property({ fieldName: 'created_at' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updated_at', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
