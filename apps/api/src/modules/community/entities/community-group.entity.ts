import { Entity, Enum, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'

export enum GroupType {
  SECTOR = 'SECTOR',
  GEOGRAPHIC = 'GEOGRAPHIC',
}

@Entity({ tableName: 'community_groups' })
export class CommunityGroup {
  [OptionalProps]?: 'id' | 'memberCount' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property()
  name!: string

  @Enum({ items: () => GroupType })
  type!: GroupType

  @Property({ nullable: true })
  sector?: string

  @Property({ nullable: true })
  region?: string

  @Property({ nullable: true })
  commune?: string

  @Property({ fieldName: 'member_count', default: 0 })
  memberCount: number = 0

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()
}
