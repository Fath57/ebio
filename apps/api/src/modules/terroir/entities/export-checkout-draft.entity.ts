import type { Rel } from '@mikro-orm/core'
import { Entity, ManyToOne, OneToOne, OptionalProps, PrimaryKeyProp, Property } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { ExportDeparture } from './export-departure.entity'

/**
 * A buyer's last unpaid terroir checkout preview: the terroir cart lives on
 * the phone only, so the 48 h reminder (FR-033) reads this instead.
 */
@Entity({ tableName: 'export_checkout_drafts' })
export class ExportCheckoutDraft {
  [PrimaryKeyProp]?: 'user'
  [OptionalProps]?: 'updatedAt'

  @OneToOne(() => User, { primary: true, owner: true, fieldName: 'user_id', deleteRule: 'cascade' })
  user!: Rel<User>

  @ManyToOne(() => ExportDeparture, { fieldName: 'departure_id', nullable: true, deleteRule: 'set null' })
  departure?: Rel<ExportDeparture> | null

  /** References `export_countries.code`. */
  @Property({ type: 'string', length: 2, columnType: 'varchar(2)' })
  country!: string

  @Property({ fieldName: 'updated_at', type: 'Date', onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ fieldName: 'reminded_at', type: 'Date', nullable: true })
  remindedAt?: Date | null
}
