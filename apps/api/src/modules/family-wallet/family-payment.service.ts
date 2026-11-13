import type { User } from '../auth/auth.entity'
import type { Order } from '../orders/entities/order.entity'
import type { Checkout } from '../payments/entities/checkout.entity'
import type { FamilyWalletOption } from './contracts/family-wallet.contract'
import type { FamilyRefusal, FamilyRefusalReason } from './family-limits'
import { EntityManager } from '@mikro-orm/postgresql'
import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { WalletTransactionType } from '../wallet/entities/wallet-transaction.entity'
import { WalletService } from '../wallet/wallet.service'
import { FamilyMemberStatus, FamilyWalletMember } from './entities/family-wallet-member.entity'
import { FamilyWalletStatus } from './entities/family-wallet.entity'
import { effectiveLimits, monthStart, refusalFor, spendable } from './family-limits'
import { familyError } from './family-texts'

/** One product of the cart with its category, for the category limit. */
export interface FamilyCartLine {
  productId: string
  categoryId: string | null
}

/** Where a refund of a cart goes, and whose month it gives back. */
export interface RefundTarget {
  walletId: string
  /** FAMILY: the family wallet; PAYER: its payer's personal wallet (closed); BUYER: the buyer's own. */
  kind: 'FAMILY' | 'PAYER' | 'BUYER'
  /** Set only when the money goes back to the family wallet: the member's month is restored. */
  familyMemberId?: string
  familyWalletId?: string
  /** Only for PAYER: whose personal wallet received it. */
  payerName?: string
}

/** What a family wallet payment leaves behind, for the notifications. */
export interface FamilyPaymentOutcome {
  familyWalletId: string
  balanceAfter: number
}

/** The wallet and member as they stand under the lock, read in SQL (the identity map may be stale). */
interface LockedRow {
  wallet_status: string
  member_status: string
  default_monthly_cap: string | null
  default_order_max: string | null
  default_category_ids: string[] | null
  monthly_cap: string | null
  order_max: string | null
  category_ids: string[] | null
}

/**
 * What each member spent from the family wallet since the 1st of the month
 * (Benin time): purchases minus their refunds, never below zero (FR-020).
 *
 * A member removed then added again is a new row, yet their month still
 * counts (spec, edge cases): lines are summed across every row of the same
 * wallet with the same number.
 *
 * Run on the given entity manager, so that inside the payment transaction it
 * reads after the wallet lock.
 */
export async function spentThisMonthByMember(em: EntityManager, memberIds: string[], now: Date): Promise<Map<string, number>> {
  const spent = new Map<string, number>(memberIds.map(id => [id, 0]))
  if (memberIds.length === 0) {
    return spent
  }
  const rows = await em.execute<Array<{ member_id: string, spent: string | number | null }>>(
    `SELECT m.id AS member_id, -SUM(t.amount) AS spent
     FROM family_wallet_members m
     JOIN family_wallet_members same ON same.family_wallet_id = m.family_wallet_id AND same.phone = m.phone
     JOIN wallet_transactions t ON t.family_member_id = same.id
     WHERE m.id IN (${memberIds.map(() => '?').join(', ')})
       AND t.type IN ('ORDER_PAYMENT', 'REFUND')
       AND t."createdAt" >= ?
     GROUP BY m.id`,
    [...memberIds, monthStart(now)],
  )
  for (const row of rows) {
    spent.set(row.member_id, Math.max(0, Math.round(Number(row.spent ?? 0) * 100) / 100))
  }
  return spent
}

/** One member's spending of the month; see `spentThisMonthByMember`. */
export async function spentThisMonth(em: EntityManager, memberId: string, now: Date): Promise<number> {
  const spent = await spentThisMonthByMember(em, [memberId], now)
  return spent.get(memberId) ?? 0
}

/**
 * Where the money of a cart goes back (research §4): the family wallet that
 * paid it while it is not closed, else its payer's personal wallet — never
 * the member's, who never owned that money. Any other cart: the buyer's own.
 *
 * A plain function rather than a provider: payments and deliveries call it
 * without importing the family module.
 */
export async function refundTargetWallet(
  em: EntityManager,
  walletService: WalletService,
  checkout: Pick<Checkout, 'familyMember'> | null | undefined,
  buyerId: string,
): Promise<RefundTarget> {
  const memberId = checkout?.familyMember?.id
  if (memberId) {
    const member = await em.findOne(FamilyWalletMember, { id: memberId }, { populate: ['familyWallet.payer'] })
    const familyWallet = member?.familyWallet
    if (member && familyWallet) {
      if (familyWallet.status !== FamilyWalletStatus.CLOSED) {
        const wallet = await walletService.getOrCreate({ familyWalletId: familyWallet.id })
        return { walletId: wallet.id, kind: 'FAMILY', familyMemberId: member.id, familyWalletId: familyWallet.id }
      }
      const payerWallet = await walletService.getOrCreate({ userId: familyWallet.payer.id })
      return { walletId: payerWallet.id, kind: 'PAYER', payerName: familyWallet.payer.name }
    }
  }
  const wallet = await walletService.getOrCreate({ userId: buyerId })
  return { walletId: wallet.id, kind: 'BUYER' }
}

/**
 * A refund brought the family wallet back above its threshold: the next
 * crossing may alert again (same rule as a top-up).
 */
export async function clearLowBalanceAlert(em: EntityManager, familyWalletId: string): Promise<void> {
  await em.execute(
    `UPDATE family_wallets fw SET low_balance_alerted = false
     FROM wallets w
     WHERE w.family_wallet_id = fw.id AND fw.id = ? AND fw.low_balance_alerted AND fw.low_balance_threshold <= w.balance`,
    [familyWalletId],
  )
}

/** « … sur votre portefeuille eBio » — where the buyer is told their refund went. */
export function refundDestination(target: RefundTarget): string {
  if (target.kind === 'FAMILY') {
    return 'sur le portefeuille famille'
  }
  if (target.kind === 'PAYER') {
    const first = (target.payerName ?? '').trim().split(/\s+/)[0]
    return first ? `sur le portefeuille eBio de ${first}, qui avait payé` : 'sur le portefeuille eBio de la personne qui avait payé'
  }
  return 'sur votre portefeuille eBio'
}

const REFUSAL_MESSAGES: Record<FamilyRefusalReason, string> = {
  INACTIVE: 'Ce portefeuille famille est suspendu.',
  CATEGORY: 'Certains produits ne sont pas autorisés avec ce portefeuille famille.',
  ORDER_MAX: 'Cette commande dépasse le maximum autorisé par commande.',
  MONTHLY_CAP: 'Cette commande dépasse ce qu\'il vous reste à dépenser ce mois-ci.',
  INSUFFICIENT: 'Le solde du portefeuille famille ne suffit pas.',
}

/** 400 `FAMILY_WALLET_REFUSED`, the reason at the top level of the body as the apps read it. */
function refused(refusal: FamilyRefusal): never {
  throw new HttpException({
    statusCode: HttpStatus.BAD_REQUEST,
    code: 'FAMILY_WALLET_REFUSED',
    message: REFUSAL_MESSAGES[refusal.reason],
    reason: refusal.reason,
    ...(refusal.blockedProductIds ? { blockedProductIds: refusal.blockedProductIds } : {}),
  }, HttpStatus.BAD_REQUEST)
}

/**
 * Paying a cart from a family wallet (US2), under the member's limits (US3).
 *
 * The limits are checked twice: by the preview, to explain a refusal before
 * the buyer taps, and by the payment, after the wallet lock — the only check
 * that counts, since two members paying at once are serialized there.
 */
@Injectable()
export class FamilyPaymentService {
  constructor(
    private readonly em: EntityManager,
    private readonly walletService: WalletService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  /**
   * The family wallets the buyer may spend, as a member, for this cart. A
   * suspended wallet or member stays listed, greyed out with INACTIVE;
   * pending, removed and closed ones are left out.
   */
  async optionsFor(buyerId: string, total: number, lines: FamilyCartLine[]): Promise<FamilyWalletOption[]> {
    if (!(await this.platformSettings.getFamilyWalletEnabled())) {
      return []
    }
    const members = await this.em.find(
      FamilyWalletMember,
      {
        user: { id: buyerId },
        status: { $in: [FamilyMemberStatus.ACTIVE, FamilyMemberStatus.SUSPENDED] },
        familyWallet: { status: { $ne: FamilyWalletStatus.CLOSED } },
      },
      { populate: ['familyWallet.payer'], orderBy: { createdAt: 'ASC' } },
    )
    if (members.length === 0) {
      return []
    }
    const balances = await this.balancesOf(members.map(member => member.familyWallet.id))
    const spent = await spentThisMonthByMember(this.em, members.map(member => member.id), new Date())

    return members.map((member) => {
      const familyWallet = member.familyWallet
      const balance = balances.get(familyWallet.id) ?? 0
      const memberSpent = spent.get(member.id) ?? 0
      const effective = effectiveLimits(familyWallet, member)
      const refusal = refusalFor({
        wallet: familyWallet,
        member,
        effective,
        spent: memberSpent,
        balance,
        total,
        productCategoryIds: lines,
      })
      const inactive = refusal?.reason === 'INACTIVE'
      return {
        memberId: member.id,
        payerFirstName: (familyWallet.payer.name ?? '').trim().split(/\s+/)[0] ?? '',
        spendable: inactive ? 0 : spendable(balance, effective, memberSpent),
        usable: refusal === null,
        reason: refusal?.reason ?? null,
        ...(refusal?.blockedProductIds ? { blockedProductIds: refusal.blockedProductIds } : {}),
      }
    })
  }

  /**
   * The buyer's own membership, checked before the checkout row is written:
   * a foreign or unknown member would otherwise surface as a foreign key
   * error. The payment re-reads it under the lock.
   */
  async assertMemberOf(buyerId: string, memberId: string | undefined): Promise<string> {
    if (!memberId) {
      throw familyError(HttpStatus.BAD_REQUEST, 'FAMILY_MEMBER_REQUIRED', 'Choisissez le portefeuille famille qui paie.')
    }
    const member = await this.em.findOne(FamilyWalletMember, { id: memberId, user: { id: buyerId } })
    if (!member) {
      throw familyError(HttpStatus.NOT_FOUND, 'FAMILY_MEMBER_NOT_FOUND', 'Ce portefeuille famille est introuvable.')
    }
    return member.id
  }

  /**
   * Pays the cart from the family wallet, inside the checkout transaction
   * (`em` is that transaction's).
   *
   * The wallet row is locked first, then everything the decision rests on is
   * read again — statuses, limits, the member's month — and only then is the
   * wallet debited. A refusal throws before any debit; a later failure rolls
   * the debit back with the orders. No partial state either way.
   *
   * The caller writes the escrowed payments, as for the personal wallet.
   */
  async pay(em: EntityManager, buyer: User, checkout: Checkout, orders: Order[], memberId: string, lines: FamilyCartLine[]): Promise<FamilyPaymentOutcome> {
    if (!(await this.platformSettings.getFamilyWalletEnabled())) {
      refused({ reason: 'INACTIVE' })
    }
    const member = await em.findOne(FamilyWalletMember, { id: memberId, user: { id: buyer.id } })
    if (!member) {
      throw familyError(HttpStatus.NOT_FOUND, 'FAMILY_MEMBER_NOT_FOUND', 'Ce portefeuille famille est introuvable.')
    }
    const familyWalletId = member.familyWallet.id

    // The lock: a second payment on this wallet waits here until this
    // transaction ends, then reads the balance and month this one left.
    const [locked] = await em.execute<Array<{ id: string, balance: string }>>(
      `SELECT id, balance FROM wallets WHERE family_wallet_id = ? FOR UPDATE`,
      [familyWalletId],
    )
    const [row] = await em.execute<LockedRow[]>(
      `SELECT fw.status AS wallet_status, m.status AS member_status,
              fw.default_monthly_cap, fw.default_order_max, fw.default_category_ids,
              m.monthly_cap, m.order_max, m.category_ids
       FROM family_wallet_members m
       JOIN family_wallets fw ON fw.id = m.family_wallet_id
       WHERE m.id = ?`,
      [memberId],
    )
    const balance = locked ? Number(locked.balance) : 0
    const total = Number(checkout.totalAmount)
    const effective = effectiveLimits(
      { defaultMonthlyCap: row.default_monthly_cap, defaultOrderMax: row.default_order_max, defaultCategoryIds: row.default_category_ids },
      { monthlyCap: row.monthly_cap, orderMax: row.order_max, categoryIds: row.category_ids },
    )
    const refusal = refusalFor({
      wallet: { status: row.wallet_status },
      member: { status: row.member_status },
      effective,
      spent: await spentThisMonth(em, memberId, new Date()),
      balance,
      total,
      productCategoryIds: lines,
    })
    if (refusal) {
      refused(refusal)
    }
    if (!locked) {
      refused({ reason: 'INSUFFICIENT' })
    }

    // Re-locks the same row (same transaction, no wait) and writes the line
    // that carries the member: their month counts it from now on.
    const balanceAfter = await this.walletService.debit(locked.id, {
      type: WalletTransactionType.ORDER_PAYMENT,
      amount: total,
      description: orders.length > 1
        ? `Panier de ${orders.length} boutiques — portefeuille famille`
        : `Commande ${orders[0].orderNumber} — portefeuille famille`,
      orderId: orders[0].id,
      familyMemberId: memberId,
    })
    checkout.familyMember = em.getReference(FamilyWalletMember, memberId)
    return { familyWalletId, balanceAfter }
  }

  private async balancesOf(familyWalletIds: string[]): Promise<Map<string, number>> {
    const rows = await this.em.execute<Array<{ family_wallet_id: string, balance: string }>>(
      `SELECT family_wallet_id, balance FROM wallets WHERE family_wallet_id IN (${familyWalletIds.map(() => '?').join(', ')})`,
      familyWalletIds,
    )
    return new Map(rows.map(row => [row.family_wallet_id, Number(row.balance)]))
  }
}
