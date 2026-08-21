import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, Index, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { Wallet } from './wallet.entity'

export enum TopupStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

/** A FedaPay payment whose confirmation credits a personal wallet. */
@Entity({ tableName: 'wallet_topups' })
export class WalletTopup {
  [OptionalProps]?: 'id' | 'status' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => Wallet, { fieldName: 'wallet_id' })
  wallet!: Rel<Wallet>

  @ManyToOne(() => User, { fieldName: 'user_id' })
  user!: Rel<User>

  @Property({ columnType: 'numeric(12,2)' })
  amount!: string

  @Enum({ items: () => TopupStatus, default: TopupStatus.PENDING })
  status: TopupStatus = TopupStatus.PENDING

  @Property({ fieldName: 'fedapay_transaction_id', length: 64, nullable: true })
  @Index()
  fedapayTransactionId?: string | null

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
