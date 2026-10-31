import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { AuditService } from '../admin/audit.service'
import { User } from '../auth/auth.entity'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { WalletTransactionType } from './entities/wallet-transaction.entity'
import { WalletService } from './wallet.service'

export type WalletOwnerType = 'SUPPLIER' | 'COURIER' | 'USER'

export interface AdminWalletFilters {
  q?: string
  ownerType?: WalletOwnerType
  /** `positive`: money owed to the owner; `negative`: the owner owes eBio; `zero`. */
  balance?: 'positive' | 'negative' | 'zero'
  sort?: 'balance_desc' | 'balance_asc' | 'updated_desc'
  page: number
  limit: number
}

const SORTS: Record<NonNullable<AdminWalletFilters['sort']>, string> = {
  balance_desc: 'w.balance DESC',
  balance_asc: 'w.balance ASC',
  updated_desc: 'w."updatedAt" DESC',
}

/** Whose wallet, in one expression shared by the filter and the sort. */
const OWNER_NAME = `COALESCE(s.shop_name, cp.full_name, u.name, '')`

const FROM = `FROM wallets w
  LEFT JOIN suppliers s ON s.id = w.supplier_id
  LEFT JOIN courier_profiles cp ON cp.id = w.courier_profile_id
  LEFT JOIN users u ON u.id = w.user_id`

/** The SQL condition and values for the wallet list; eBio's own accounts are never in it. */
export function buildWalletConditions(filters: Omit<AdminWalletFilters, 'page' | 'limit' | 'sort'>): { where: string, values: unknown[] } {
  const conditions = ['w.platform_account IS NULL']
  const values: unknown[] = []
  if (filters.q) {
    conditions.push(`${OWNER_NAME} ILIKE ?`)
    values.push(`%${filters.q}%`)
  }
  if (filters.ownerType === 'SUPPLIER')
    conditions.push('w.supplier_id IS NOT NULL')
  if (filters.ownerType === 'COURIER')
    conditions.push('w.courier_profile_id IS NOT NULL')
  if (filters.ownerType === 'USER')
    conditions.push('w.user_id IS NOT NULL')
  if (filters.balance === 'positive')
    conditions.push('w.balance > 0')
  if (filters.balance === 'negative')
    conditions.push('w.balance < 0')
  if (filters.balance === 'zero')
    conditions.push('w.balance = 0')
  return { where: conditions.join(' AND '), values }
}

/**
 * Wallets as the back office handles them: a paged, searchable list, and the
 * one manual movement staff may make — a debit, with its reason written in
 * the owner's history, in the audit trail and in a notification to them.
 */
@Injectable()
export class AdminWalletsService {
  constructor(
    private readonly em: EntityManager,
    private readonly walletService: WalletService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
  ) {}

  async list(filters: AdminWalletFilters) {
    const { where, values } = buildWalletConditions(filters)
    const connection = this.em.getConnection()
    const limit = Math.min(Math.max(filters.limit, 1), 100)
    const page = Math.max(filters.page, 1)

    const [[totals], rows] = await Promise.all([
      connection.execute(
        `SELECT COUNT(*) AS count,
                COALESCE(SUM(w.balance) FILTER (WHERE w.balance > 0), 0) AS owed,
                COALESCE(-SUM(w.balance) FILTER (WHERE w.balance < 0), 0) AS debt
         ${FROM} WHERE ${where}`,
        values,
      ) as Promise<Array<Record<string, unknown>>>,
      connection.execute(
        `SELECT w.id, w.balance, w."updatedAt" AS updated_at,
                s.id AS supplier_id, cp.id AS courier_id, u.id AS user_id,
                ${OWNER_NAME} AS owner_name
         ${FROM} WHERE ${where}
         ORDER BY ${SORTS[filters.sort ?? 'balance_desc']}, w.id
         LIMIT ? OFFSET ?`,
        [...values, limit, (page - 1) * limit],
      ) as Promise<Array<Record<string, unknown>>>,
    ])

    return {
      items: rows.map(row => ({
        id: row.id as string,
        balance: Number(row.balance ?? 0),
        ownerType: (row.supplier_id ? 'SUPPLIER' : row.courier_id ? 'COURIER' : 'USER') as WalletOwnerType,
        ownerName: (row.owner_name as string) || '—',
        supplierId: (row.supplier_id as string | null) ?? null,
        courierId: (row.courier_id as string | null) ?? null,
        userId: (row.user_id as string | null) ?? null,
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      })),
      total: Number(totals?.count ?? 0),
      page,
      limit,
      totalOwed: Number(totals?.owed ?? 0),
      totalDebt: Number(totals?.debt ?? 0),
    }
  }

  /**
   * Takes `amount` off a wallet. Refused when it would go below zero: a
   * debt is something eBio records from a real flow (a cash commission),
   * not something staff create by hand.
   */
  async debit(walletId: string, input: { amount: number, reason: string, notify: boolean }, actorUserId: string) {
    const reason = input.reason.trim()
    if (reason.length < 3) {
      throw new BadRequestException('Indiquez le motif du débit')
    }
    const [owner] = await this.em.getConnection().execute(
      `SELECT w.id, w.platform_account,
              COALESCE(s.user_id, cp.user_id, w.user_id) AS owner_user_id,
              CASE WHEN w.supplier_id IS NOT NULL THEN 'supplier' WHEN w.courier_profile_id IS NOT NULL THEN 'courier' ELSE 'client' END AS app
       ${FROM} WHERE w.id = ?`,
      [walletId],
    ) as Array<Record<string, unknown>>
    if (!owner) {
      throw new NotFoundException('Portefeuille introuvable')
    }
    if (owner.platform_account) {
      throw new BadRequestException('Les comptes eBio ne se débitent pas à la main')
    }

    const balanceAfter = await this.walletService.debit(walletId, {
      type: WalletTransactionType.ADJUSTMENT,
      amount: input.amount,
      description: `Débit eBio — ${reason}`,
    })

    await this.auditService.record({
      actorUserId,
      action: 'WALLET_DEBITED',
      targetType: 'wallet',
      targetId: walletId,
      payload: { amount: input.amount, reason, balanceAfter, notified: input.notify },
    })

    if (input.notify && owner.owner_user_id) {
      const user = await this.em.findOne(User, { id: owner.owner_user_id as string })
      if (user) {
        const format = (value: number) => `${value.toLocaleString('fr-FR')} FCFA`
        await this.notificationsService.send({
          user,
          type: NotificationType.SYSTEM,
          title: 'Débit sur votre portefeuille eBio',
          body: `${format(input.amount)} ont été débités de votre portefeuille : ${reason}. Nouveau solde : ${format(balanceAfter)}.`,
          data: { reason: 'wallet_debit', walletId },
          channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
          apps: [owner.app as string],
        })
      }
    }

    return { balanceAfter }
  }
}
