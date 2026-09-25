import type { Rel } from '@mikro-orm/core'
import { Entity, ManyToOne, OptionalProps, PrimaryKey, Property, Unique } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { Campaign } from './campaign.entity'

/**
 * Someone opened a campaign.
 *
 * One row per person and not per tap: the question is how many people a
 * message reached, and counting the one who opened it four times as four
 * would flatter every campaign equally.
 */
@Entity({ tableName: 'campaign_opens' })
@Unique({ properties: ['campaign', 'user'] })
export class CampaignOpen {
  [OptionalProps]?: 'id' | 'openedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => Campaign, { fieldName: 'campaign_id', deleteRule: 'cascade' })
  campaign!: Rel<Campaign>

  @ManyToOne(() => User, { fieldName: 'user_id', deleteRule: 'cascade' })
  user!: Rel<User>

  @Property({ fieldName: 'opened_at' })
  openedAt: Date = new Date()
}
