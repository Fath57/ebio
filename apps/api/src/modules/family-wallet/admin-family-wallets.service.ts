import type { AdminFamilyWalletsQuery } from './contracts/family-wallet.contract'
import type { FamilyHistoryPage } from './family-history'
import type { FamilyLimits } from './family-limits'
import { EntityManager } from '@mikro-orm/postgresql'
import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common'
import { AuditService } from '../admin/audit.service'
import { Wallet } from '../wallet/entities/wallet.entity'
import { FamilyMemberStatus, FamilyWalletMember } from './entities/family-wallet-member.entity'
import { FamilyWallet, FamilyWalletStatus } from './entities/family-wallet.entity'
import { loadFamilyHistory } from './family-history'
import { effectiveLimits } from './family-limits'
import { adminSuspendedMemberIds } from './family-members.service'
import { FamilyNotifierService } from './family-notifier.service'
import { spentThisMonthByMember } from './family-payment.service'
import { familyError, familyWalletClosed } from './family-texts'

/** A family wallet as a row of the back-office list. */
export interface AdminFamilyWalletRowView {
  wallet: FamilyWallet
  walletId: string
  balance: number
  memberCount: number
}

export interface AdminFamilyMemberView {
  member: FamilyWalletMember
  suspendedByAdmin: boolean
  effective: FamilyLimits
  spentThisMonth: number
}

export interface AdminFamilyWalletDetailView extends AdminFamilyWalletRowView {
  members: AdminFamilyMemberView[]
  history: FamilyHistoryPage
}

/**
 * The family wallets as eBio's staff handle them (FR-032, FR-033): a list,
 * one wallet with its members and ledger, and the suspensions decided for
 * fraud or a dispute — each written to the audit trail, and lifted by staff
 * only.
 */
@Injectable()
export class AdminFamilyWalletsService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: AuditService,
    private readonly notifier: FamilyNotifierService,
  ) {}

  async list(query: AdminFamilyWalletsQuery): Promise<{ rows: AdminFamilyWalletRowView[], total: number, page: number, limit: number }> {
    const where: Record<string, unknown> = {}
    if (query.status) {
      where.status = query.status
    }
    if (query.search) {
      const like = `%${query.search}%`
      where.payer = { $or: [{ name: { $ilike: like } }, { email: { $ilike: like } }, { phone: { $ilike: like } }] }
    }
    const [wallets, total] = await this.em.findAndCount(FamilyWallet, where, {
      populate: ['payer'],
      orderBy: { createdAt: 'DESC', id: 'DESC' },
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    })
    return { rows: await this.rows(wallets), total, page: query.page, limit: query.limit }
  }

  async detail(id: string, now: Date = new Date()): Promise<AdminFamilyWalletDetailView> {
    const wallet = await this.find(id)
    const [row] = await this.rows([wallet])
    const members = await this.em.find(FamilyWalletMember, { familyWallet: { id } }, { orderBy: { createdAt: 'ASC' } })
    const memberIds = members.map(member => member.id)
    const [spent, byAdmin, history] = await Promise.all([
      spentThisMonthByMember(this.em, memberIds, now),
      adminSuspendedMemberIds(this.em, memberIds),
      loadFamilyHistory(this.em, row.walletId, { page: 1, limit: 20 }),
    ])
    return {
      ...row,
      members: members.map(member => ({
        member,
        suspendedByAdmin: member.status === FamilyMemberStatus.SUSPENDED && byAdmin.has(member.id),
        effective: effectiveLimits(wallet, member),
        spentThisMonth: spent.get(member.id) ?? 0,
      })),
      history,
    }
  }

  /** Suspends the whole wallet; the payer cannot lift it. */
  async suspendWallet(id: string, reason: string, actorUserId: string): Promise<AdminFamilyWalletDetailView> {
    const wallet = await this.findOpen(id)
    const wasActive = wallet.status === FamilyWalletStatus.ACTIVE
    wallet.status = FamilyWalletStatus.SUSPENDED
    wallet.suspendedByAdmin = true
    await this.em.flush()
    await this.audit.record({ actorUserId, action: 'FAMILY_WALLET_SUSPENDED', targetType: 'family_wallet', targetId: id, reason })
    await this.notifier.onAdminWalletStatus(id, true, reason)
    if (wasActive) {
      await this.notifier.onStatusChanged(id, 'WALLET_SUSPENDED')
    }
    return this.detail(id)
  }

  /** Lifts any suspension of the wallet, eBio's or the payer's. */
  async resumeWallet(id: string, reason: string | null, actorUserId: string): Promise<AdminFamilyWalletDetailView> {
    const wallet = await this.findOpen(id)
    const wasSuspended = wallet.status === FamilyWalletStatus.SUSPENDED
    wallet.status = FamilyWalletStatus.ACTIVE
    wallet.suspendedByAdmin = false
    await this.em.flush()
    await this.audit.record({ actorUserId, action: 'FAMILY_WALLET_RESUMED', targetType: 'family_wallet', targetId: id, reason: reason ?? undefined })
    if (wasSuspended) {
      await this.notifier.onAdminWalletStatus(id, false, null)
      await this.notifier.onStatusChanged(id, 'WALLET_RESUMED')
    }
    return this.detail(id)
  }

  /** Suspends one member; the others keep paying, and the payer cannot lift it. */
  async suspendMember(memberId: string, reason: string, actorUserId: string): Promise<AdminFamilyWalletDetailView> {
    const member = await this.findMember(memberId)
    if (member.status !== FamilyMemberStatus.ACTIVE && member.status !== FamilyMemberStatus.SUSPENDED) {
      throw familyError(HttpStatus.CONFLICT, 'FAMILY_MEMBER_NOT_ACTIVE', 'Seul un membre ayant rejoint le portefeuille peut être suspendu.')
    }
    const wasActive = member.status === FamilyMemberStatus.ACTIVE
    member.status = FamilyMemberStatus.SUSPENDED
    await this.em.flush()
    await this.audit.record({
      actorUserId,
      action: 'FAMILY_MEMBER_SUSPENDED',
      targetType: 'family_member',
      targetId: memberId,
      reason,
      payload: { familyWalletId: member.familyWallet.id },
    })
    if (wasActive) {
      await this.notifier.onStatusChanged(member.familyWallet.id, 'MEMBER_SUSPENDED_BY_EBIO', [member.id])
    }
    return this.detail(member.familyWallet.id)
  }

  /** Lifts eBio's suspension of a member. */
  async resumeMember(memberId: string, reason: string | null, actorUserId: string): Promise<AdminFamilyWalletDetailView> {
    const member = await this.findMember(memberId)
    if (member.status !== FamilyMemberStatus.SUSPENDED) {
      throw familyError(HttpStatus.CONFLICT, 'FAMILY_MEMBER_NOT_SUSPENDED', 'Ce membre n\'est pas suspendu.')
    }
    member.status = FamilyMemberStatus.ACTIVE
    await this.em.flush()
    await this.audit.record({
      actorUserId,
      action: 'FAMILY_MEMBER_RESUMED',
      targetType: 'family_member',
      targetId: memberId,
      reason: reason ?? undefined,
      payload: { familyWalletId: member.familyWallet.id },
    })
    await this.notifier.onStatusChanged(member.familyWallet.id, 'MEMBER_RESUMED', [member.id])
    return this.detail(member.familyWallet.id)
  }

  private async rows(wallets: FamilyWallet[]): Promise<AdminFamilyWalletRowView[]> {
    if (wallets.length === 0) {
      return []
    }
    const ids = wallets.map(wallet => wallet.id)
    const balances = await this.em.find(Wallet, { familyWallet: { id: { $in: ids } } })
    const counts = await this.em.getConnection().execute<Array<{ family_wallet_id: string, count: string }>>(
      `SELECT family_wallet_id, COUNT(*)::text AS count
       FROM family_wallet_members
       WHERE status <> 'REMOVED' AND family_wallet_id IN (${ids.map(() => '?').join(', ')})
       GROUP BY family_wallet_id`,
      ids,
    )
    const countOf = new Map(counts.map(row => [row.family_wallet_id, Number(row.count)]))
    return wallets.map((wallet) => {
      const balanceRow = balances.find(row => row.familyWallet?.id === wallet.id)
      return {
        wallet,
        walletId: balanceRow?.id ?? '',
        balance: Number(balanceRow?.balance ?? 0),
        memberCount: countOf.get(wallet.id) ?? 0,
      }
    })
  }

  private async find(id: string): Promise<FamilyWallet> {
    const wallet = await this.em.findOne(FamilyWallet, { id }, { populate: ['payer'] })
    if (!wallet) {
      throw new NotFoundException('Portefeuille famille introuvable')
    }
    return wallet
  }

  private async findOpen(id: string): Promise<FamilyWallet> {
    const wallet = await this.find(id)
    if (wallet.status === FamilyWalletStatus.CLOSED) {
      throw familyWalletClosed()
    }
    return wallet
  }

  private async findMember(memberId: string): Promise<FamilyWalletMember> {
    const member = await this.em.findOne(FamilyWalletMember, { id: memberId }, { populate: ['familyWallet'] })
    if (!member) {
      throw new NotFoundException('Membre introuvable')
    }
    if (member.familyWallet.status === FamilyWalletStatus.CLOSED) {
      throw familyWalletClosed()
    }
    return member
  }
}
