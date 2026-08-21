import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, Index, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { Order } from '../../orders/entities/order.entity'
import { Payment } from '../../payments/payment.entity'
import { Wallet } from './wallet.entity'

export enum WalletTransactionType {
  TOPUP = 'TOPUP',
  ORDER_PAYMENT = 'ORDER_PAYMENT',
  SALE_CREDIT = 'SALE_CREDIT',
  COMMISSION_DEBIT = 'COMMISSION_DEBIT',
  WITHDRAWAL = 'WITHDRAWAL',
  WITHDRAWAL_REFUND = 'WITHDRAWAL_REFUND',
  REFUND = 'REFUND',
  ADJUSTMENT = 'ADJUSTMENT',
}

/**
 * Append-only ledger. `amount` is signed (credit > 0, debit < 0) and
 * `balanceAfter` snapshots the wallet right after the movement, so any
 * balance can be audited and rebuilt from history.
 */
@Entity({ tableName: 'wallet_transactions' })
@Index({ properties: ['wallet', 'createdAt'] })
export class WalletTransaction {
  [OptionalProps]?: 'id' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => Wallet, { fieldName: 'wallet_id' })
  wallet!: Rel<Wallet>

  @Enum({ items: () => WalletTransactionType })
  type!: WalletTransactionType

  @Property({ columnType: 'numeric(12,2)' })
  amount!: string

  @Property({ fieldName: 'balance_after', columnType: 'numeric(12,2)' })
  balanceAfter!: string

  @ManyToOne(() => Order, { fieldName: 'order_id', nullable: true })
  order?: Rel<Order> | null

  @ManyToOne(() => Payment, { fieldName: 'payment_id', nullable: true })
  payment?: Rel<Payment> | null

  /** Not a FK relation on purpose: avoids an import cycle with withdrawals. */
  @Property({ fieldName: 'withdrawal_id', type: 'uuid', nullable: true })
  withdrawalId?: string | null

  @Property()
  description!: string

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()
}
