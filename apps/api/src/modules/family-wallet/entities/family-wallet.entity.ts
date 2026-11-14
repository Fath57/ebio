import type { Rel } from '@mikro-orm/core'
import { ArrayType, Entity, Enum, OneToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'

export enum FamilyWalletStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  /** For good: the balance went back to the payer's personal wallet. */
  CLOSED = 'CLOSED',
}

/**
 * A payer's family wallet (010): money their relatives spend on eBio orders
 * only, within limits.
 *
 * The balance is not here: it is the `wallets` row whose `family_wallet_id`
 * points at this one, so it shares the row lock, the ledger and the top-up
 * flow of every other wallet. This row carries the rest, who pays, the
 * status, the limits every member gets by default, the low-balance alert.
 */
@Entity({ tableName: 'family_wallets' })
export class FamilyWallet {
  [OptionalProps]?: 'id' | 'status' | 'suspendedByAdmin' | 'lowBalanceThreshold' | 'lowBalanceAlerted' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  /** One family wallet per payer (FR-001), whatever its status. */
  @OneToOne(() => User, { fieldName: 'payer_id', owner: true, unique: 'family_wallets_payer_id_unique' })
  payer!: Rel<User>

  @Enum({ items: () => FamilyWalletStatus, columnType: 'varchar(10)', default: FamilyWalletStatus.ACTIVE })
  status: FamilyWalletStatus = FamilyWalletStatus.ACTIVE

  /** A suspension decided by eBio, which only eBio lifts. */
  @Property({ fieldName: 'suspended_by_admin', type: 'boolean', default: false })
  suspendedByAdmin: boolean = false

  /** numeric(12,2), MikroORM hands it over as a string; Number() at the edges. */
  @Property({ fieldName: 'low_balance_threshold', columnType: 'numeric(12,2)', default: '5000' })
  lowBalanceThreshold: string = '5000'

  /** Set when the alert fired; cleared once the balance is back above the threshold. */
  @Property({ fieldName: 'low_balance_alerted', type: 'boolean', default: false })
  lowBalanceAlerted: boolean = false

  /** Per member and per calendar month; null means no cap. */
  @Property({ fieldName: 'default_monthly_cap', columnType: 'numeric(12,2)', nullable: true })
  defaultMonthlyCap?: string | null

  @Property({ fieldName: 'default_order_max', columnType: 'numeric(12,2)', nullable: true })
  defaultOrderMax?: string | null

  /** Allowed categories; null means all of them. */
  @Property({ fieldName: 'default_category_ids', type: ArrayType, columnType: 'uuid[]', nullable: true })
  defaultCategoryIds?: string[] | null

  @Property({ fieldName: 'created_at', type: 'Date' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updated_at', type: 'Date', onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ fieldName: 'closed_at', type: 'Date', nullable: true })
  closedAt?: Date | null
}
