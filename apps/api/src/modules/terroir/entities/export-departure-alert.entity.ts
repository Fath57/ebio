import type { Rel } from '@mikro-orm/core'
import { Entity, ManyToOne, OptionalProps, PrimaryKey, Property, Unique } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'

/** « Me prévenir du prochain départ » (FR-032): sent once, then kept as sent. */
@Entity({ tableName: 'export_departure_alerts' })
@Unique({
  name: 'export_departure_alerts_pending_unique',
  expression: 'create unique index "export_departure_alerts_pending_unique" on "export_departure_alerts" ("user_id", "country") where "sent_at" is null',
})
export class ExportDepartureAlert {
  [OptionalProps]?: 'id' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => User, { fieldName: 'user_id', deleteRule: 'cascade' })
  user!: Rel<User>

  /** References `export_countries.code`. */
  @Property({ type: 'string', length: 2, columnType: 'varchar(2)' })
  country!: string

  @Property({ fieldName: 'created_at', type: 'Date' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'sent_at', type: 'Date', nullable: true })
  sentAt?: Date | null
}
