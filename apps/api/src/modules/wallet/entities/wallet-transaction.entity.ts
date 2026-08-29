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
  /** eBio pays the shop back for a platform-funded promo discount. */
  PROMO_COMPENSATION = 'PROMO_COMPENSATION',
  /** Courier's share of the delivery fee on an online-paid order. */
  DELIVERY_EARNING = 'DELIVERY_EARNING',
  /** eBio's cut on a cash delivery fee the courier kept in hand. */
  DELIVERY_COMMISSION = 'DELIVERY_COMMISSION',
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

  /** Same rationale: plain uuid, no FK, so the wallet module never imports deliveries. */
  @Property({ fieldName: 'delivery_id', type: 'uuid', nullable: true })
  deliveryId?: string | null

  @Property()
  description!: string

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()
}
