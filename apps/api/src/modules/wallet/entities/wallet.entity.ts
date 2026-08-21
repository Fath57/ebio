import type { Rel } from '@mikro-orm/core'
import { Entity, OneToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { Supplier } from '../../suppliers/supplier.entity'

/**
 * Internal FCFA balance. The real money sits on the platform's FedaPay
 * account; wallets are the accounting that says who owns what. Exactly one
 * owner: a personal wallet (user) or a shop wallet (supplier), never both —
 * a supplier-user has two separate wallets.
 *
 * `balance` is only ever written by WalletService inside a SQL transaction
 * holding a row lock, alongside its ledger line. It always equals the sum of
 * the wallet's transactions.
 */
@Entity({ tableName: 'wallets' })
export class Wallet {
  [OptionalProps]?: 'id' | 'balance' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @OneToOne(() => User, { fieldName: 'user_id', nullable: true, unique: true })
  user?: Rel<User> | null

  @OneToOne(() => Supplier, { fieldName: 'supplier_id', nullable: true, unique: true })
  supplier?: Rel<Supplier> | null

  /** numeric(12,2) — MikroORM hands it over as a string; Number() at the edges. */
  @Property({ columnType: 'numeric(12,2)', default: '0' })
  balance: string = '0'

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
