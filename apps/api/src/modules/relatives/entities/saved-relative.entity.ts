import type { Rel } from '@mikro-orm/core'
import { Entity, Index, ManyToOne, OptionalProps, PrimaryKey, Property, Unique } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'

/**
 * A relative in the payer's address book, so a cart can be sent to "Maman"
 * again without retyping her address.
 *
 * Only a convenience: a checkout copies the name, phone and address it uses,
 * so editing or deleting an entry never touches a past order. At most 20 per
 * owner, checked in the service.
 */
@Entity({ tableName: 'saved_relatives' })
@Unique({ name: 'saved_relatives_owner_phone_unique', properties: ['owner', 'phone'] })
export class SavedRelative {
  [OptionalProps]?: 'id' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Index({ name: 'saved_relatives_owner_idx' })
  @ManyToOne(() => User, { fieldName: 'owner_id', deleteRule: 'cascade' })
  owner!: Rel<User>

  /** How the payer calls them ("Maman"). */
  @Property({ type: 'string', length: 40 })
  nickname!: string

  @Property({ type: 'string', length: 120 })
  name!: string

  /** Beninese number only (+229 followed by 10 digits). */
  @Property({ type: 'string', length: 16 })
  phone!: string

  /** Optional since 010: a family wallet member may have none known. */
  @Property({ type: 'text', nullable: true })
  address?: string | null

  @Property({ type: 'double', nullable: true })
  latitude?: number | null

  @Property({ type: 'double', nullable: true })
  longitude?: number | null

  @Property({ fieldName: 'created_at', type: 'Date' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updated_at', type: 'Date', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
