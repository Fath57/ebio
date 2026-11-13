import type { INestApplication } from '@nestjs/common'
import { EntityManager } from '@mikro-orm/postgresql'
import { beforeEach, describe, expect, it } from 'vitest'
import { createUserData } from '../../../factories/user.factory'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { RelativesService } from '../../relatives/relatives.service'
import { AccountDeletionService } from '../../users/account-deletion.service'
import { UsersModule } from '../../users/users.module'
import { WalletTransactionType } from '../../wallet/entities/wallet-transaction.entity'
import { WalletService } from '../../wallet/wallet.service'
import { AdminFamilyWalletsService } from '../admin-family-wallets.service'
import { FamilyMemberStatus, FamilyWalletMember } from '../entities/family-wallet-member.entity'
import { FamilyFundingService } from '../family-funding.service'
import { FamilyMemberViewService } from '../family-member-view.service'
import { FamilyMembersService } from '../family-members.service'
import { FamilyWalletModule } from '../family-wallet.module'
import { FamilyWalletsService } from '../family-wallets.service'

const MAMAN_PHONE = '+2290197000001'
const TATA_PHONE = '+2290196000002'

/** The error body a refusal carries, for its `code`. */
async function refusal(promise: Promise<unknown>): Promise<{ status: number, code: unknown }> {
  try {
    await promise
  }
  catch (error) {
    const typed = error as { getStatus?: () => number, getResponse?: () => unknown }
    const body = typed.getResponse?.()
    return {
      status: typed.getStatus?.() ?? 0,
      code: typeof body === 'object' && body !== null ? (body as Record<string, unknown>).code : undefined,
    }
  }
  throw new Error('L\'opération aurait dû être refusée')
}

/** As a fresh request would: nothing remembered from the previous one. */
function fresh(app: INestApplication): void {
  app.get(EntityManager).clear()
}

/** A payer, Maman and Tata both with verified accounts, and a funded wallet. */
async function arrange(app: INestApplication, em: EntityManager, balance = 12_000) {
  const payer = await createUserData(em, { name: 'Awa Diallo' })
  const mamanUser = await createUserData(em, { name: 'Afiavi Kossou', phone: MAMAN_PHONE, phoneVerifiedAt: new Date() })
  const tataUser = await createUserData(em, { name: 'Rose Agbo', phone: TATA_PHONE, phoneVerifiedAt: new Date() })
  const familyWallet = await app.get(FamilyWalletsService).open(payer.id)
  const members = app.get(FamilyMembersService)
  const maman = await members.add(payer.id, { relative: { nickname: 'Maman', name: 'Afiavi Kossou', phone: MAMAN_PHONE, address: null, latitude: null, longitude: null } })
  const tata = await members.add(payer.id, { relative: { nickname: 'Tata', name: 'Rose Agbo', phone: TATA_PHONE, address: null, latitude: null, longitude: null } })
  const balanceRow = await app.get(FamilyWalletsService).balanceWallet(familyWallet.id)
  if (balance > 0) {
    await app.get(WalletService).credit(balanceRow.id, { type: WalletTransactionType.TOPUP, amount: balance, description: 'Recharge' })
  }
  fresh(app)
  return { payer, mamanUser, tataUser, familyWallet, maman, tata, balanceWalletId: balanceRow.id }
}

async function statusNotifications(em: EntityManager, userId: string): Promise<string[]> {
  const rows = await em.getConnection().execute(
    `SELECT data->>'event' AS event FROM notifications WHERE "userId" = ? AND type = 'FAMILY_WALLET_STATUS' ORDER BY "createdAt"`,
    [userId],
  ) as Array<{ event: string }>
  return rows.map(row => row.event)
}

/**
 * US5: the payer pauses a member or the whole wallet, removes a member,
 * closes the wallet and gets the balance back; eBio's suspensions stay
 * eBio's; an open wallet blocks the payer's account deletion.
 */
describe('portefeuille famille — contrôle (e2e)', () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 4 }, {
      imports: [RolesModule, AuditModule, UsersModule, FamilyWalletModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('suspend un membre sans toucher aux autres, le réactive, le retire en gardant le carnet', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const { payer, mamanUser, tataUser, maman, tata } = await arrange(app, em)
    const members = app.get(FamilyMembersService)
    const view = app.get(FamilyMemberViewService)

    await members.suspend(payer.id, maman.id)
    // Twice changes nothing, and says nothing twice.
    await members.suspend(payer.id, maman.id)
    fresh(app)

    expect(await view.mine(mamanUser.id)).toMatchObject([{ status: 'SUSPENDED', spendable: 0 }])
    expect(await view.mine(tataUser.id)).toMatchObject([{ status: 'ACTIVE', spendable: 12_000 }])

    await members.resume(payer.id, maman.id)
    fresh(app)
    expect(await view.mine(mamanUser.id)).toMatchObject([{ status: 'ACTIVE', spendable: 12_000 }])

    await members.remove(payer.id, tata.id)
    fresh(app)
    expect(await view.mine(tataUser.id)).toEqual([])
    const payerView = await app.get(FamilyWalletsService).get(payer.id)
    expect(payerView.members.map(entry => entry.member.nickname)).toEqual(['Maman'])
    expect((await app.get(RelativesService).list(payer.id)).map(entry => entry.phone)).toContain(TATA_PHONE)
    expect(await refusal(members.suspend(payer.id, tata.id))).toEqual({ status: 404, code: 'FAMILY_MEMBER_NONE' })

    expect(await statusNotifications(em, mamanUser.id)).toEqual(['ADDED', 'MEMBER_SUSPENDED', 'MEMBER_RESUMED'])
    expect(await statusNotifications(em, tataUser.id)).toEqual(['ADDED', 'MEMBER_REMOVED'])
  })

  it('suspend tout le portefeuille ; une suspension d\'eBio ne se lève que par eBio', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const { payer, mamanUser, tataUser, familyWallet } = await arrange(app, em)
    const service = app.get(FamilyWalletsService)
    const view = app.get(FamilyMemberViewService)
    const admin = await createUserData(em, { name: 'Staff eBio' })

    await service.suspend(payer.id)
    fresh(app)
    expect((await view.mine(mamanUser.id))[0]).toMatchObject({ status: 'SUSPENDED', spendable: 0 })
    expect((await view.mine(tataUser.id))[0]).toMatchObject({ status: 'SUSPENDED', spendable: 0 })
    await service.resume(payer.id)

    await app.get(AdminFamilyWalletsService).suspendWallet(familyWallet.id, 'Litige sur une recharge', admin.id)
    fresh(app)
    expect(await refusal(service.resume(payer.id))).toEqual({ status: 403, code: 'FAMILY_WALLET_SUSPENDED_BY_ADMIN' })
    expect(await refusal(service.close(payer.id))).toEqual({ status: 403, code: 'FAMILY_WALLET_SUSPENDED_BY_ADMIN' })

    const detail = await app.get(AdminFamilyWalletsService).resumeWallet(familyWallet.id, null, admin.id)
    expect(detail.wallet.status).toBe('ACTIVE')
    expect(detail.wallet.suspendedByAdmin).toBe(false)
    const audit = await em.getConnection().execute(
      `SELECT action, reason FROM audit_logs WHERE target_id = ? ORDER BY created_at`,
      [familyWallet.id],
    ) as Array<{ action: string, reason: string | null }>
    expect(audit).toEqual([
      { action: 'FAMILY_WALLET_SUSPENDED', reason: 'Litige sur une recharge' },
      { action: 'FAMILY_WALLET_RESUMED', reason: null },
    ])
    expect(await statusNotifications(em, mamanUser.id)).toEqual(['ADDED', 'WALLET_SUSPENDED', 'WALLET_RESUMED', 'WALLET_SUSPENDED', 'WALLET_RESUMED'])
  })

  it('garde la suspension d\'un membre décidée par eBio jusqu\'à ce qu\'eBio la lève', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const { payer, maman } = await arrange(app, em)
    const admin = await createUserData(em, { name: 'Staff eBio' })
    const adminService = app.get(AdminFamilyWalletsService)

    const detail = await adminService.suspendMember(maman.id, 'Fraude suspectée', admin.id)
    expect(detail.members.find(entry => entry.member.id === maman.id)).toMatchObject({ suspendedByAdmin: true })
    fresh(app)
    expect(await refusal(app.get(FamilyMembersService).resume(payer.id, maman.id))).toEqual({ status: 403, code: 'FAMILY_MEMBER_SUSPENDED_BY_ADMIN' })

    await adminService.resumeMember(maman.id, null, admin.id)
    fresh(app)
    const member = await em.fork().findOneOrFail(FamilyWalletMember, { id: maman.id })
    expect(member.status).toBe(FamilyMemberStatus.ACTIVE)
  })

  it('ferme en rendant le solde au portefeuille personnel une seule fois, même rejouée', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const { payer, mamanUser, balanceWalletId } = await arrange(app, em)
    const service = app.get(FamilyWalletsService)

    // Two taps at once: one closes, the other finds it closed.
    const outcomes = await Promise.all([service.close(payer.id), service.close(payer.id)])
    await expect(service.close(payer.id)).resolves.toMatchObject({ refunded: 0, personalBalance: 12_000 })

    expect(outcomes.map(outcome => outcome.refunded).sort((a, b) => a - b)).toEqual([0, 12_000])
    const lines = await em.getConnection().execute(
      `SELECT type, amount::float AS amount FROM wallet_transactions WHERE type IN ('FAMILY_CLOSURE_OUT', 'FAMILY_CLOSURE_IN') ORDER BY type`,
    ) as Array<{ type: string, amount: number }>
    expect(lines).toEqual([
      { type: 'FAMILY_CLOSURE_IN', amount: 12_000 },
      { type: 'FAMILY_CLOSURE_OUT', amount: -12_000 },
    ])
    fresh(app)
    const personal = await app.get(WalletService).getOrCreate({ userId: payer.id })
    expect(Number(personal.balance)).toBe(12_000)
    expect(await app.get(WalletService).getBalance(balanceWalletId)).toBe(0)
    const view = await service.get(payer.id)
    expect(view.wallet.status).toBe('CLOSED')
    expect(view.wallet.closedAt).toBeInstanceOf(Date)

    // Nothing comes in any more, and the members lost it.
    expect(await refusal(app.get(FamilyFundingService).initiateTopup(payer.id, 5_000))).toEqual({ status: 409, code: 'FAMILY_WALLET_CLOSED' })
    expect(await app.get(FamilyMemberViewService).mine(mamanUser.id)).toEqual([])
    expect(await statusNotifications(em, mamanUser.id)).toEqual(['ADDED', 'WALLET_CLOSED'])
  })

  it('refuse la suppression du compte du payeur tant que le portefeuille est ouvert, l\'accepte après fermeture', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const { payer } = await arrange(app, em, 0)
    const deletion = app.get(AccountDeletionService)

    expect(await refusal(deletion.deleteOwnAccount(payer.id))).toEqual({ status: 409, code: 'FAMILY_WALLET_OPEN' })

    await app.get(FamilyWalletsService).close(payer.id)
    await deletion.deleteOwnAccount(payer.id)

    const [row] = await em.getConnection().execute(`SELECT status FROM users WHERE id = ?`, [payer.id]) as Array<{ status: string }>
    expect(row.status).toBe('DELETED')
  })

  it('retire le membre qui supprime son compte, sans toucher aux autres', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const { payer, mamanUser, maman, tata } = await arrange(app, em, 0)

    await app.get(AccountDeletionService).deleteOwnAccount(mamanUser.id)

    const rows = await em.getConnection().execute(
      `SELECT id, status FROM family_wallet_members WHERE id IN (?, ?)`,
      [maman.id, tata.id],
    ) as Array<{ id: string, status: string }>
    expect(Object.fromEntries(rows.map(row => [row.id, row.status]))).toEqual({ [maman.id]: 'REMOVED', [tata.id]: 'ACTIVE' })
    fresh(app)
    expect((await app.get(FamilyWalletsService).get(payer.id)).members.map(entry => entry.member.nickname)).toEqual(['Tata'])
  })

  it('règle les limites propres d\'un membre, null revenant à la valeur par défaut', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const { payer, maman } = await arrange(app, em)
    const wallets = app.get(FamilyWalletsService)
    const members = app.get(FamilyMembersService)
    await wallets.updateDefaults(payer.id, { defaults: { monthlyCap: 2_000, orderMax: 1_500 } })

    await members.updateLimits(payer.id, maman.id, { monthlyCap: 4_000 })
    fresh(app)
    let view = await wallets.get(payer.id)
    expect(view.members.find(entry => entry.member.id === maman.id)?.member).toMatchObject({ monthlyCap: '4000.00' })

    await members.updateLimits(payer.id, maman.id, { monthlyCap: null })
    fresh(app)
    view = await wallets.get(payer.id)
    expect(view.members.find(entry => entry.member.id === maman.id)?.member.monthlyCap ?? null).toBeNull()

    const unknown = '00000000-0000-4000-8000-000000000000'
    expect(await refusal(members.updateLimits(payer.id, maman.id, { categoryIds: [unknown] }))).toEqual({ status: 400, code: 'FAMILY_CATEGORY_UNKNOWN' })
    expect(await refusal(wallets.updateDefaults(payer.id, { defaults: { categoryIds: [unknown] } }))).toEqual({ status: 400, code: 'FAMILY_CATEGORY_UNKNOWN' })
  })

  it('liste les portefeuilles famille au back-office, filtrés par statut et par payeur', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const { payer, familyWallet } = await arrange(app, em)
    const other = await createUserData(em, { name: 'Koffi Mensah' })
    await app.get(FamilyWalletsService).open(other.id)
    await app.get(FamilyWalletsService).suspend(other.id)
    const admin = app.get(AdminFamilyWalletsService)

    const all = await admin.list({ page: 1, limit: 20 })
    const awa = await admin.list({ search: 'awa', page: 1, limit: 20 })
    const suspended = await admin.list({ status: 'SUSPENDED', page: 1, limit: 20 })

    expect(all.total).toBe(2)
    expect(awa.rows).toHaveLength(1)
    expect(awa.rows[0]).toMatchObject({ balance: 12_000, memberCount: 2 })
    expect(awa.rows[0].wallet.id).toBe(familyWallet.id)
    expect(awa.rows[0].wallet.payer.id).toBe(payer.id)
    expect(suspended.rows.map(row => row.wallet.payer.id)).toEqual([other.id])
  })
})
