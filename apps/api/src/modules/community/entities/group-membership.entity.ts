import type { Rel } from '@mikro-orm/core'
import { Entity, ManyToOne, OptionalProps, PrimaryKey, Property, Unique } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { CommunityGroup } from './community-group.entity'

@Entity({ tableName: 'group_memberships' })
@Unique({ properties: ['user', 'group'] })
export class GroupMembership {
  [OptionalProps]?: 'id' | 'joinedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => User, { fieldName: 'user_id' })
  user!: Rel<User>

  @ManyToOne(() => CommunityGroup, { fieldName: 'group_id' })
  group!: Rel<CommunityGroup>

  @Property({ fieldName: 'joined_at' })
  joinedAt: Date = new Date()
}
