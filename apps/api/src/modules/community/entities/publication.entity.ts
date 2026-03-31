import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { CommunityGroup } from './community-group.entity'

export enum PublicationType {
  PRODUCT_ANNOUNCEMENT = 'PRODUCT_ANNOUNCEMENT',
  TECHNICAL_QUESTION = 'TECHNICAL_QUESTION',
  MARKET_ALERT = 'MARKET_ALERT',
  TRAINING_SHARE = 'TRAINING_SHARE',
}

export enum PublicationStatus {
  ACTIVE = 'ACTIVE',
  MODERATED = 'MODERATED',
  DELETED = 'DELETED',
}

@Entity({ tableName: 'publications' })
export class Publication {
  [OptionalProps]?: 'id' | 'mediaUrls' | 'reportCount' | 'status' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => User, { fieldName: 'author_id' })
  author!: Rel<User>

  @ManyToOne(() => CommunityGroup, { fieldName: 'group_id' })
  group!: Rel<CommunityGroup>

  @Enum({ items: () => PublicationType })
  type!: PublicationType

  @Property({ type: 'text' })
  content!: string

  @Property({ type: 'jsonb', default: '[]' })
  mediaUrls: string[] = []

  @Property({ fieldName: 'report_count', default: 0 })
  reportCount: number = 0

  @Enum({ items: () => PublicationStatus, default: PublicationStatus.ACTIVE })
  status: PublicationStatus = PublicationStatus.ACTIVE

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
