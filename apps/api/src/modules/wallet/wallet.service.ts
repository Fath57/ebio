import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { CourierProfile } from '../deliveries/entities/courier-profile.entity'
import { Supplier } from '../suppliers/supplier.entity'
import { WalletTransaction, WalletTransactionType } from './entities/wallet-transaction.entity'
import { PlatformAccount, Wallet } from './entities/wallet.entity'

export interface WalletMovement {
  type: WalletTransactionType
  /** Positive amount; `direction` decides the sign. */
  amount: number
  description: string
  orderId?: string
  paymentId?: string
  withdrawalId?: string
  deliveryId?: string
  /** COMMISSION_DEBIT / DELIVERY_COMMISSION may push the balance below zero (cash debt). */
  allowNegative?: boolean
}

/** Exactly one owner: personal, shop, courier wallet, or an eBio account. */
export interface WalletOwner {
  userId?: string
  supplierId?: string
  courierId?: string
  platformAccount?: PlatformAccount
}

/**
 * The only writer of wallet balances. Every movement runs in its own SQL
 * transaction, locks the wallet row (`FOR UPDATE`), writes the append-only
 * ledger line with the resulting balance, then updates the balance itself —
 * so two concurrent debits can never both spend the same money, and any
 * balance is auditable from its history.
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name)

  constructor(private readonly em: EntityManager) {}

  /** Lazily creates the wallet on first access. */
  async getOrCreate(owner: WalletOwner): Promise<Wallet> {
    const where = owner.platformAccount
      ? { platformAccount: owner.platformAccount }
      : owner.supplierId
        ? { supplier: { id: owner.supplierId } }
        : owner.courierId
          ? { courier: { id: owner.courierId } }
          : { user: { id: owner.userId } }

    let wallet = await this.em.findOne(Wallet, where)
    if (!wallet) {
      // Concurrent first accesses race to insert; the UNIQUE constraint makes
      // the loser fail, and a re-read returns the winner's row.
      try {
        wallet = this.em.create(Wallet, owner.platformAccount
          ? { platformAccount: owner.platformAccount }
          : owner.supplierId
            ? { supplier: this.em.getReference(Supplier, owner.supplierId) }
            : owner.courierId
              ? { courier: this.em.getReference(CourierProfile, owner.courierId) }
              : { user: this.em.getReference(User, owner.userId!) })
        await this.em.persistAndFlush(wallet)
      }
      catch {
        this.em.clear()
        wallet = await this.em.findOneOrFail(Wallet, where)
      }
    }
    return wallet
  }

  /**
   * eBio's side of a movement, posted as it happens so each revenue stream
   * carries a real balance. Never throws and never blocks: the platform's
   * own books must not be able to fail a buyer's order or a courier's
   * settlement. Cost centres are allowed to go negative.
   */
  async post(account: PlatformAccount, direction: 'credit' | 'debit', movement: WalletMovement): Promise<void> {
    if (!(movement.amount > 0)) {
      return
    }
    try {
      const wallet = await this.getOrCreate({ platformAccount: account })
      if (direction === 'credit') {
        await this.credit(wallet.id, movement)
      }
      else {
        await this.debit(wallet.id, { ...movement, allowNegative: true })
      }
    }
    catch (error) {
      this.logger.error(`Platform posting failed on ${account} (${movement.type})`, error instanceof Error ? error.stack : String(error))
    }
  }

  async getBalance(walletId: string): Promise<number> {
    const wallet = await this.em.findOneOrFail(Wallet, { id: walletId })
    return Number(wallet.balance)
  }

  async credit(walletId: string, movement: WalletMovement): Promise<number> {
    return this.apply(walletId, movement, +1)
  }

  async debit(walletId: string, movement: WalletMovement): Promise<number> {
    return this.apply(walletId, movement, -1)
  }

  /** Returns the balance after the movement. */
  private async apply(walletId: string, movement: WalletMovement, sign: 1 | -1): Promise<number> {
    if (!(movement.amount > 0)) {
      throw new BadRequestException('Le montant doit être strictement positif')
    }
    const amount = Math.round(movement.amount * 100) / 100

    return this.em.transactional(async (em) => {
      // Row lock: concurrent movements on the same wallet serialize here.
      const [row] = await em.getConnection().execute(
        `SELECT balance FROM wallets WHERE id = ? FOR UPDATE`,
        [walletId],
      )
      if (!row) {
        throw new BadRequestException('Portefeuille introuvable')
      }

      const balance = Number(row.balance)
      const next = Math.round((balance + sign * amount) * 100) / 100

      if (next < 0 && !movement.allowNegative) {
        throw new BadRequestException('Solde insuffisant')
      }

      await em.getConnection().execute(
        `UPDATE wallets SET balance = ?, "updatedAt" = NOW() WHERE id = ?`,
        [next.toFixed(2), walletId],
      )

      em.create(WalletTransaction, {
        wallet: em.getReference(Wallet, walletId),
        type: movement.type,
        amount: (sign * amount).toFixed(2),
        balanceAfter: next.toFixed(2),
        order: movement.orderId ?? null,
        payment: movement.paymentId ?? null,
        withdrawalId: movement.withdrawalId ?? null,
        deliveryId: movement.deliveryId ?? null,
        description: movement.description,
      })

      return next
    })
  }

  async getTransactions(walletId: string, page: number, limit: number): Promise<{
    items: Array<{
      id: string
      type: string
      amount: number
      balanceAfter: number
      description: string
      orderId: string | null
      deliveryId: string | null
      createdAt: string
    }>
    total: number
    page: number
    limit: number
  }> {
    const [rows, total] = await this.em.findAndCount(
      WalletTransaction,
      { wallet: { id: walletId } },
      { orderBy: { createdAt: 'DESC' }, limit, offset: (page - 1) * limit },
    )
    return {
      items: rows.map(row => ({
        id: row.id,
        type: row.type,
        amount: Number(row.amount),
        balanceAfter: Number(row.balanceAfter),
        description: row.description,
        orderId: row.order?.id ?? null,
        deliveryId: row.deliveryId ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
    }
  }
}
