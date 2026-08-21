import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, Index, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { Supplier } from '../../suppliers/supplier.entity'
import { PayoutNumber } from './payout-number.entity'
import { Wallet } from './wallet.entity'

export enum WithdrawalStatus {
  /** Funds already debited (reserved); waiting for an admin. */
  PENDING = 'PENDING',
  /** Admin approved; the FedaPay payout is on its way. */
  PROCESSING = 'PROCESSING',
  PAID = 'PAID',
  /** Payout failed after approval — the wallet was re-credited. */
  FAILED = 'FAILED',
  /** Admin refused — the wallet was re-credited. */
  REJECTED = 'REJECTED',
  /** Supplier cancelled while still PENDING — the wallet was re-credited. */
  CANCELLED = 'CANCELLED',
}

/**
 * A supplier's request to move wallet money to their validated Mobile Money
 * number. Creating the request debits the wallet at once (funds reservation);
 * every non-PAID terminal status credits it back.
 */
@Entity({ tableName: 'withdrawal_requests' })
@Index({ properties: ['status'] })
export class WithdrawalRequest {
  [OptionalProps]?: 'id' | 'status' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => Supplier, { fieldName: 'supplier_id' })
  supplier!: Rel<Supplier>

  @ManyToOne(() => Wallet, { fieldName: 'wallet_id' })
  wallet!: Rel<Wallet>

  @ManyToOne(() => PayoutNumber, { fieldName: 'payout_number_id' })
  payoutNumber!: Rel<PayoutNumber>

  @Property({ columnType: 'numeric(12,2)' })
  amount!: string

  @Enum({ items: () => WithdrawalStatus, default: WithdrawalStatus.PENDING })
  status: WithdrawalStatus = WithdrawalStatus.PENDING

  @Property({ fieldName: 'fedapay_payout_id', length: 64, nullable: true })
  fedapayPayoutId?: string | null

  @Property({ fieldName: 'provider_reference', length: 128, nullable: true })
  providerReference?: string | null

  @Property({ fieldName: 'rejection_reason', nullable: true })
  rejectionReason?: string | null

  @Property({ fieldName: 'processed_by', type: 'uuid', nullable: true })
  processedBy?: string | null

  @Property({ fieldName: 'processed_at', nullable: true })
  processedAt?: Date | null

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()
}
