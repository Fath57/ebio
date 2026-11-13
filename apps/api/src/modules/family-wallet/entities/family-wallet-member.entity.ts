import type { Rel } from '@mikro-orm/core'
import { ArrayType, Entity, Enum, Index, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { SavedRelative } from '../../relatives/entities/saved-relative.entity'
import { FamilyWallet } from './family-wallet.entity'

export enum FamilyMemberStatus {
  /** Added, but no account has proven this number by SMS yet. */
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  /** Out of the wallet; the row stays so past purchases keep their member. */
  REMOVED = 'REMOVED',
}

/**
 * A relative allowed to spend a family wallet.
 *
 * Nickname and phone are copies taken when the member is added: the address
 * book entry may be edited or deleted later without touching the access. The
 * account is linked only through a phone proven by SMS (FR-004).
 *
 * Own limits override the wallet's defaults one by one; null means « as the
 * default ».
 */
@Entity({ tableName: 'family_wallet_members' })
@Index({
  name: 'family_wallet_members_wallet_phone_unique',
  expression: `CREATE UNIQUE INDEX IF NOT EXISTS "family_wallet_members_wallet_phone_unique" ON "family_wallet_members" ("family_wallet_id", "phone") WHERE "status" <> 'REMOVED'`,
})
export class FamilyWalletMember {
  [OptionalProps]?: 'id' | 'status' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Index({ name: 'family_wallet_members_wallet_idx' })
  @ManyToOne(() => FamilyWallet, { fieldName: 'family_wallet_id', deleteRule: 'cascade' })
  familyWallet!: Rel<FamilyWallet>

  @ManyToOne(() => SavedRelative, { fieldName: 'saved_relative_id', nullable: true, deleteRule: 'set null' })
  savedRelative?: Rel<SavedRelative> | null

  @Property({ type: 'string', length: 40 })
  nickname!: string

  /** Beninese number only (+229 followed by 10 digits). */
  @Index({ name: 'family_wallet_members_phone_idx' })
  @Property({ type: 'string', length: 16 })
  phone!: string

  /** The account that proved this number by SMS; null while pending. */
  @ManyToOne(() => User, { fieldName: 'user_id', nullable: true })
  user?: Rel<User> | null

  @Enum({ items: () => FamilyMemberStatus, columnType: 'varchar(10)', default: FamilyMemberStatus.PENDING })
  status: FamilyMemberStatus = FamilyMemberStatus.PENDING

  @Property({ fieldName: 'monthly_cap', columnType: 'numeric(12,2)', nullable: true })
  monthlyCap?: string | null

  @Property({ fieldName: 'order_max', columnType: 'numeric(12,2)', nullable: true })
  orderMax?: string | null

  @Property({ fieldName: 'category_ids', type: ArrayType, columnType: 'uuid[]', nullable: true })
  categoryIds?: string[] | null

  /** Last invitation SMS. */
  @Property({ fieldName: 'invited_at', type: 'Date', nullable: true })
  invitedAt?: Date | null

  /** The payer was told this member is still pending after 30 days. */
  @Property({ fieldName: 'pending_reminded_at', type: 'Date', nullable: true })
  pendingRemindedAt?: Date | null

  @Property({ fieldName: 'created_at', type: 'Date' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updated_at', type: 'Date', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
