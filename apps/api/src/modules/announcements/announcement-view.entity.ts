import type { Rel } from '@mikro-orm/core'
import { Entity, ManyToOne, OptionalProps, PrimaryKey, Property, Unique } from '@mikro-orm/core'
import { User } from '../auth/auth.entity'
import { Announcement } from './announcement.entity'

/**
 * The last time a person saw an announcement.
 *
 * One row per pair, not one per display: what we want to know is "should it be
 * shown again?", not how many times it went by. The counter is kept anyway,
 * because an announcement seen five times to no effect tells the shop that
 * paid for it something.
 */
@Entity({ tableName: 'announcement_views' })
@Unique({ properties: ['announcement', 'user'] })
export class AnnouncementView {
  [OptionalProps]?: 'id' | 'times' | 'seenAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => Announcement, { fieldName: 'announcement_id', deleteRule: 'cascade' })
  announcement!: Rel<Announcement>

  @ManyToOne(() => User, { fieldName: 'user_id', deleteRule: 'cascade' })
  user!: Rel<User>

  @Property({ fieldName: 'seen_at' })
  seenAt: Date = new Date()

  @Property({ default: 1 })
  times: number = 1
}
