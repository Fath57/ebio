import type { DisplayCurrency } from '../currency/contracts/currency.contract'
import type { UpdateFamilyWallet } from './contracts/family-wallet.contract'
import type { FamilyHistoryPage } from './family-history'
import { UniqueConstraintViolationException } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { ExchangeRatesService } from '../currency/exchange-rates.service'
import { Category } from '../products/entities/category.entity'
import { WalletTransactionType } from '../wallet/entities/wallet-transaction.entity'
import { Wallet } from '../wallet/entities/wallet.entity'
import { WalletService } from '../wallet/wallet.service'
import { FamilyMemberStatus, FamilyWalletMember } from './entities/family-wallet-member.entity'
import { FamilyWallet, FamilyWalletStatus } from './entities/family-wallet.entity'
import { loadFamilyHistory } from './family-history'
import { FamilyNotifierService } from './family-notifier.service'
import { spentThisMonthByMember } from './family-payment.service'
import { familyError, familyWalletClosed, familyWalletNone } from './family-texts'

/** A member as the payer sees it: the entity and what it spent this month. */
export interface FamilyMemberView {
  member: FamilyWalletMember
  spentThisMonth: number
}

/** The payer's family wallet, with what the entity alone cannot say. */
export interface FamilyWalletView {
  wallet: FamilyWallet
  /** FCFA, read from the `wallets` row. */
  balance: number
  /** The balance in the payer's display currency; null in FCFA or without a rate. */
  display: { currency: DisplayCurrency, balance: number } | null
  members: FamilyMemberView[]
}

function familyWalletExists() {
  return familyError(HttpStatus.CONFLICT, 'FAMILY_WALLET_EXISTS', 'Vous avez déjà un portefeuille famille.')
}

/** A suspension decided by eBio is lifted by eBio only. */
export function familySuspendedByAdmin() {
  return familyError(
    HttpStatus.FORBIDDEN,
    'FAMILY_WALLET_SUSPENDED_BY_ADMIN',
    'Ce portefeuille famille a été suspendu par eBio. Contactez le support pour le réactiver.',
  )
}

/**
 * A category list must name real categories: a typo would silently block
 * every purchase. Null (every category) passes.
 */
export async function assertCategoriesExist(em: EntityManager, categoryIds: string[] | null | undefined): Promise<void> {
  if (!categoryIds) {
    return
  }
  const unique = [...new Set(categoryIds)]
  const found = await em.count(Category, { id: { $in: unique } })
  if (found !== unique.length) {
    throw familyError(HttpStatus.BAD_REQUEST, 'FAMILY_CATEGORY_UNKNOWN', 'Une des catégories choisies n\'existe pas.')
  }
}

/** What a closure gave back: the balance moved to the personal wallet. */
export interface FamilyClosure {
  refunded: number
  personalBalance: number
}

/** `null` stays `null`; a number goes to the numeric column as a string. */
function toColumn(value: number | null): string | null {
  return value === null ? null : value.toFixed(2)
}

/**
 * The payer's side of the family wallet: opening it, reading it, its
 * default limits.
 *
 * Payer-only: the wallet is always looked up by its payer, so nobody reaches
 * someone else's.
 */
@Injectable()
export class FamilyWalletsService {
  constructor(
    private readonly em: EntityManager,
    private readonly exchangeRates: ExchangeRatesService,
    private readonly walletService: WalletService,
    private readonly notifier: FamilyNotifierService,
  ) {}

  /** The payer's family wallet, whatever its status, or 404 `FAMILY_WALLET_NONE`. */
  async findByPayer(payerId: string): Promise<FamilyWallet> {
    const wallet = await this.em.findOne(FamilyWallet, { payer: { id: payerId } })
    if (!wallet) {
      throw familyWalletNone()
    }
    return wallet
  }

  /** Same, refusing a closed one: nothing may be added to it any more. */
  async findOpenByPayer(payerId: string): Promise<FamilyWallet> {
    const wallet = await this.findByPayer(payerId)
    if (wallet.status === FamilyWalletStatus.CLOSED) {
      throw familyWalletClosed()
    }
    return wallet
  }

  /** The `wallets` row holding the balance. */
  async balanceWallet(familyWalletId: string): Promise<Wallet> {
    return this.em.findOneOrFail(Wallet, { familyWallet: { id: familyWalletId } }, { refresh: true })
  }

  /**
   * Opens the payer's family wallet, empty and without members (FR-001), and
   * the `wallets` row that will hold its balance — both or neither.
   */
  async open(payerId: string): Promise<FamilyWallet> {
    const existing = await this.em.count(FamilyWallet, { payer: { id: payerId } })
    if (existing > 0) {
      throw familyWalletExists()
    }
    try {
      return await this.em.transactional(async (em) => {
        const wallet = em.create(FamilyWallet, { payer: em.getReference(User, payerId) })
        await em.flush()
        em.create(Wallet, { familyWallet: wallet })
        await em.flush()
        return wallet
      })
    }
    catch (error) {
      // Two openings at once both pass the count: the unique index decides.
      if (error instanceof UniqueConstraintViolationException) {
        this.em.clear()
        throw familyWalletExists()
      }
      throw error
    }
  }

  async get(payerId: string, now: Date = new Date()): Promise<FamilyWalletView> {
    const wallet = await this.findByPayer(payerId)
    return this.view(wallet, now)
  }

  /**
   * Default limits and alert threshold. Only what is sent changes; a limit
   * sent as null is lifted. Applies to the next payments, never to past ones
   * (FR-022).
   */
  async updateDefaults(payerId: string, input: UpdateFamilyWallet): Promise<FamilyWalletView> {
    const wallet = await this.findOpenByPayer(payerId)
    const defaults = input.defaults ?? {}
    await assertCategoriesExist(this.em, defaults.categoryIds)
    if (defaults.monthlyCap !== undefined) {
      wallet.defaultMonthlyCap = toColumn(defaults.monthlyCap)
    }
    if (defaults.orderMax !== undefined) {
      wallet.defaultOrderMax = toColumn(defaults.orderMax)
    }
    if (defaults.categoryIds !== undefined) {
      wallet.defaultCategoryIds = defaults.categoryIds
    }
    if (input.lowBalanceThreshold !== undefined) {
      wallet.lowBalanceThreshold = input.lowBalanceThreshold.toFixed(2)
      // A threshold lowered under the balance re-arms the alert.
      const balance = Number((await this.balanceWallet(wallet.id)).balance)
      if (balance >= input.lowBalanceThreshold) {
        wallet.lowBalanceAlerted = false
      }
    }
    await this.em.flush()
    return this.view(wallet, new Date())
  }

  /**
   * The wallet's history for the payer (FR-024): top-ups, transfers,
   * purchases with member, shop and products, refunds. `memberId` narrows it
   * to that member exactly, removed ones included.
   */
  async transactions(payerId: string, options: { memberId?: string, page: number, limit: number }): Promise<FamilyHistoryPage> {
    const wallet = await this.findByPayer(payerId)
    if (options.memberId) {
      const owned = await this.em.count(FamilyWalletMember, { id: options.memberId, familyWallet: { id: wallet.id } })
      if (owned === 0) {
        throw new NotFoundException('Membre introuvable')
      }
    }
    const balanceRow = await this.balanceWallet(wallet.id)
    return loadFamilyHistory(this.em, balanceRow.id, {
      memberIds: options.memberId ? [options.memberId] : undefined,
      page: options.page,
      limit: options.limit,
    })
  }

  /** Pauses the whole wallet (FR-028): no member can pay until it is resumed. */
  async suspend(payerId: string): Promise<FamilyWalletView> {
    const wallet = await this.findOpenByPayer(payerId)
    if (wallet.status === FamilyWalletStatus.ACTIVE) {
      wallet.status = FamilyWalletStatus.SUSPENDED
      await this.em.flush()
      await this.notifier.onStatusChanged(wallet.id, 'WALLET_SUSPENDED')
    }
    return this.view(wallet, new Date())
  }

  /** Lifts the payer's own pause; one decided by eBio stays (403). */
  async resume(payerId: string): Promise<FamilyWalletView> {
    const wallet = await this.findOpenByPayer(payerId)
    if (wallet.suspendedByAdmin) {
      throw familySuspendedByAdmin()
    }
    if (wallet.status === FamilyWalletStatus.SUSPENDED) {
      wallet.status = FamilyWalletStatus.ACTIVE
      await this.em.flush()
      await this.notifier.onStatusChanged(wallet.id, 'WALLET_RESUMED')
    }
    return this.view(wallet, new Date())
  }

  /**
   * Closes the wallet for good (FR-029): its whole balance leaves as
   * `FAMILY_CLOSURE_OUT` and lands on the payer's personal wallet as
   * `FAMILY_CLOSURE_IN`, with the status, in one transaction.
   *
   * Replayed — a double tap, a retried request — it finds the wallet closed
   * under the row lock and moves nothing: the payer is credited once. Refused
   * while eBio holds it suspended: closing would move disputed money.
   */
  async close(payerId: string): Promise<FamilyClosure> {
    const wallet = await this.findByPayer(payerId)
    if (wallet.suspendedByAdmin && wallet.status !== FamilyWalletStatus.CLOSED) {
      throw familySuspendedByAdmin()
    }
    const personal = await this.walletService.getOrCreate({ userId: payerId })

    const outcome = await this.em.transactional(async (em) => {
      const [locked] = await em.execute<Array<{ status: string }>>(
        `SELECT status FROM family_wallets WHERE id = ? FOR UPDATE`,
        [wallet.id],
      )
      if (!locked || locked.status === FamilyWalletStatus.CLOSED) {
        return { refunded: 0, closedNow: false, personalBalance: null }
      }
      const [balanceRow] = await em.execute<Array<{ id: string, balance: string }>>(
        `SELECT id, balance FROM wallets WHERE family_wallet_id = ? FOR UPDATE`,
        [wallet.id],
      )
      const refunded = Math.max(0, Number(balanceRow?.balance ?? 0))
      let personalBalance: number | null = null
      if (balanceRow && refunded > 0) {
        await this.walletService.debit(balanceRow.id, {
          type: WalletTransactionType.FAMILY_CLOSURE_OUT,
          amount: refunded,
          description: 'Fermeture du portefeuille famille',
        })
        personalBalance = await this.walletService.credit(personal.id, {
          type: WalletTransactionType.FAMILY_CLOSURE_IN,
          amount: refunded,
          description: 'Solde du portefeuille famille fermé',
        })
      }
      await em.execute(
        `UPDATE family_wallets SET status = 'CLOSED', closed_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [wallet.id],
      )
      return { refunded, closedNow: true, personalBalance }
    })

    // The status was written in SQL under the lock: re-read it.
    await this.em.refresh(wallet)
    if (outcome.closedNow) {
      await this.notifier.onStatusChanged(wallet.id, 'WALLET_CLOSED')
    }
    const personalBalance = outcome.personalBalance
      ?? Number((await this.em.findOneOrFail(Wallet, { id: personal.id }, { refresh: true })).balance)
    return { refunded: outcome.refunded, personalBalance }
  }

  private async view(wallet: FamilyWallet, now: Date): Promise<FamilyWalletView> {
    const balanceRow = await this.balanceWallet(wallet.id)
    const balance = Number(balanceRow.balance)
    const payer = await this.em.findOneOrFail(User, { id: wallet.payer.id })
    const currency = payer.displayCurrency as DisplayCurrency
    const displayBalance = await this.exchangeRates.toDisplay(balance, currency)

    // Removed members leave the list; their purchases stay in the history.
    const members = await this.em.find(
      FamilyWalletMember,
      { familyWallet: { id: wallet.id }, status: { $ne: FamilyMemberStatus.REMOVED } },
      { orderBy: { createdAt: 'ASC' } },
    )
    const spent = await spentThisMonthByMember(this.em, members.map(member => member.id), now)

    return {
      wallet,
      balance,
      display: displayBalance === null ? null : { currency, balance: displayBalance },
      members: members.map(member => ({ member, spentThisMonth: spent.get(member.id) ?? 0 })),
    }
  }
}
