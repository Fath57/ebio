import type { DisplayCurrency } from '../currency/contracts/currency.contract'
import type { UpdateFamilyWallet } from './contracts/family-wallet.contract'
import { UniqueConstraintViolationException } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { HttpStatus, Injectable } from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { ExchangeRatesService } from '../currency/exchange-rates.service'
import { Wallet } from '../wallet/entities/wallet.entity'
import { FamilyMemberStatus, FamilyWalletMember } from './entities/family-wallet-member.entity'
import { FamilyWallet, FamilyWalletStatus } from './entities/family-wallet.entity'
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
