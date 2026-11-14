import type { FamilyHistoryPage } from './family-history'
import type { FamilyLimits } from './family-limits'
import { EntityManager } from '@mikro-orm/postgresql'
import { HttpStatus, Injectable } from '@nestjs/common'
import { Category } from '../products/entities/category.entity'
import { Wallet } from '../wallet/entities/wallet.entity'
import { FamilyMemberStatus, FamilyWalletMember } from './entities/family-wallet-member.entity'
import { FamilyWalletStatus } from './entities/family-wallet.entity'
import { loadFamilyHistory } from './family-history'
import { effectiveLimits, spendable } from './family-limits'
import { spentThisMonthByMember } from './family-payment.service'
import { familyError } from './family-texts'

/**
 * A family wallet as one of its members sees it: what they may spend, their
 * limits, their month, never the balance (FR-025).
 */
export interface MemberWalletView {
  member: FamilyWalletMember
  payerName: string
  /** ACTIVE only when the wallet and the member both are. */
  status: 'ACTIVE' | 'SUSPENDED'
  spendable: number
  effective: FamilyLimits
  /** Names of the allowed categories; null means all of them. */
  categoryNames: string[] | null
  spentThisMonth: number
}

/**
 * The member's side: the family wallets they may spend, and their own
 * purchases on each. Everything is looked up through the member's own
 * account, so nobody reads another member's line.
 */
@Injectable()
export class FamilyMemberViewService {
  constructor(private readonly em: EntityManager) {}

  /** Wallets the account belongs to, active or paused; closed ones and removed accesses are gone. */
  async mine(userId: string, now: Date = new Date()): Promise<MemberWalletView[]> {
    const members = await this.em.find(
      FamilyWalletMember,
      {
        user: { id: userId },
        status: { $in: [FamilyMemberStatus.ACTIVE, FamilyMemberStatus.SUSPENDED] },
        familyWallet: { status: { $ne: FamilyWalletStatus.CLOSED } },
      },
      { populate: ['familyWallet.payer'], orderBy: { createdAt: 'ASC' } },
    )
    if (members.length === 0) {
      return []
    }

    const balances = await this.em.find(Wallet, { familyWallet: { id: { $in: members.map(member => member.familyWallet.id) } } })
    const balanceOf = new Map(balances.map(row => [row.familyWallet!.id, Number(row.balance)]))
    const spent = await spentThisMonthByMember(this.em, members.map(member => member.id), now)

    const categoryIds = [...new Set(members.flatMap(member => effectiveLimits(member.familyWallet, member).categoryIds ?? []))]
    const categories = categoryIds.length > 0
      ? await this.em.find(Category, { id: { $in: categoryIds } }, { orderBy: { sortOrder: 'ASC', name: 'ASC' } })
      : []

    return members.map((member) => {
      const wallet = member.familyWallet
      const effective = effectiveLimits(wallet, member)
      const status = wallet.status === FamilyWalletStatus.ACTIVE && member.status === FamilyMemberStatus.ACTIVE ? 'ACTIVE' : 'SUSPENDED'
      const spentThisMonth = spent.get(member.id) ?? 0
      const allowed = effective.categoryIds ? new Set(effective.categoryIds) : null
      return {
        member,
        payerName: wallet.payer.name,
        status,
        spendable: status === 'ACTIVE' ? spendable(balanceOf.get(wallet.id) ?? 0, effective, spentThisMonth) : 0,
        effective,
        categoryNames: allowed ? categories.filter(category => allowed.has(category.id)).map(category => category.name) : null,
        spentThisMonth,
      }
    })
  }

  /**
   * The member's own purchases and refunds on that wallet, the access they
   * had before a removal included. Someone else's member id is a 404.
   */
  async transactions(userId: string, memberId: string, page: number, limit: number): Promise<FamilyHistoryPage> {
    const member = await this.em.findOne(FamilyWalletMember, { id: memberId, user: { id: userId } })
    if (!member) {
      throw familyError(HttpStatus.NOT_FOUND, 'FAMILY_MEMBER_NONE', 'Ce portefeuille famille est introuvable.')
    }
    const own = await this.em.find(FamilyWalletMember, { familyWallet: { id: member.familyWallet.id }, user: { id: userId } })
    const balanceRow = await this.em.findOneOrFail(Wallet, { familyWallet: { id: member.familyWallet.id } })
    return loadFamilyHistory(this.em, balanceRow.id, { memberIds: own.map(row => row.id), page, limit })
  }
}
