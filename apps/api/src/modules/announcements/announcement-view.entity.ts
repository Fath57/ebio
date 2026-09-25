import type { Rel } from '@mikro-orm/core'
import { Entity, ManyToOne, OptionalProps, PrimaryKey, Property, Unique } from '@mikro-orm/core'
import { User } from '../auth/auth.entity'
import { Announcement } from './announcement.entity'

/**
 * La dernière fois qu'une personne a vu une annonce.
 *
 * Une ligne par couple, et non une par affichage : ce qu'on veut savoir est
 * « faut-il la remontrer ? », pas combien de fois elle est passée. Le compteur
 * est gardé quand même, parce qu'une annonce vue cinq fois sans effet dit
 * quelque chose à qui l'a payée.
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
