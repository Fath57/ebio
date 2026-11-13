import type { INestApplication } from '@nestjs/common'
import type { CreateRelative } from '../../relatives/contracts/relative.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { beforeEach, describe, expect, it } from 'vitest'
import { createUserData } from '../../../factories/user.factory'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { RelativesService } from '../../relatives/relatives.service'
import { PlatformSettingsService } from '../../settings/platform-settings.service'
import { TopupStatus, WalletTopup } from '../../wallet/entities/wallet-topup.entity'
import { WalletTransactionType } from '../../wallet/entities/wallet-transaction.entity'
import { TopupService } from '../../wallet/topup.service'
import { WalletService } from '../../wallet/wallet.service'
import { FamilyMemberStatus } from '../entities/family-wallet-member.entity'
import { FamilyFundingService } from '../family-funding.service'
import { FamilyMembersService } from '../family-members.service'
import { FamilyWalletEnabledGuard } from '../family-wallet-enabled.guard'
import { FamilyWalletModule } from '../family-wallet.module'
import { FamilyWalletsService } from '../family-wallets.service'

const MAMAN_PHONE = '+2290197000001'
const TATA_PHONE = '+2290196000002'

function newRelative(overrides: Partial<CreateRelative> = {}): CreateRelative {
  return {
    nickname: 'Tata',
    name: 'Rose Agbo',
    phone: TATA_PHONE,
    address: null,
    latitude: null,
    longitude: null,
    ...overrides,
  }
}

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

/**
 * US1: a payer opens their family wallet, adds relatives from the address
 * book or new ones, and funds it — by card, or from their personal wallet.
 */
describe('portefeuille famille — ouverture, membres, recharge (e2e)', () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 4 }, {
      imports: [RolesModule, AuditModule, FamilyWalletModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('reste fermé tant que le réglage plateforme est faux', async (context) => {
    const { app } = context as { app: INestApplication }
    const guard = app.get(FamilyWalletEnabledGuard)
    const settings = app.get(PlatformSettingsService)

    expect(await refusal(guard.canActivate())).toEqual({ status: 403, code: 'FAMILY_WALLET_DISABLED' })

    await settings.setFamilyWalletEnabled(true)
    await expect(guard.canActivate()).resolves.toBe(true)
  })

  it('ouvre un seul portefeuille par payeur, vide et sans membre', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const service = app.get(FamilyWalletsService)
    const payer = await createUserData(em, { name: 'Awa Diallo' })

    expect(await refusal(service.get(payer.id))).toEqual({ status: 404, code: 'FAMILY_WALLET_NONE' })

    await service.open(payer.id)
    fresh(app)
    const view = await service.get(payer.id)

    expect(view.wallet.status).toBe('ACTIVE')
    expect(view.balance).toBe(0)
    expect(view.members).toEqual([])
    expect(await refusal(service.open(payer.id))).toEqual({ status: 409, code: 'FAMILY_WALLET_EXISTS' })
  })

  it('ajoute un proche du carnet et crée un nouveau proche, qui rejoint aussi le carnet', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const payer = await createUserData(em, { name: 'Awa Diallo' })
    await app.get(FamilyWalletsService).open(payer.id)
    const relatives = app.get(RelativesService)
    const maman = await relatives.create(payer.id, newRelative({
      nickname: 'Maman',
      name: 'Afiavi Kossou',
      phone: MAMAN_PHONE,
      address: 'Cadjèhoun, rue après la pharmacie, portail bleu',
      latitude: 6.3576,
      longitude: 2.3912,
    }))

    const members = app.get(FamilyMembersService)
    const fromBook = await members.add(payer.id, { savedRelativeId: maman.id })
    const created = await members.add(payer.id, { relative: newRelative() })

    expect(fromBook).toMatchObject({ nickname: 'Maman', phone: MAMAN_PHONE })
    expect(created).toMatchObject({ nickname: 'Tata', phone: TATA_PHONE })
    fresh(app)
    const book = await relatives.list(payer.id)
    expect(book.map(entry => entry.phone).sort()).toEqual([TATA_PHONE, MAMAN_PHONE].sort())
    expect(book.find(entry => entry.phone === TATA_PHONE)?.address ?? null).toBeNull()

    const view = await app.get(FamilyWalletsService).get(payer.id)
    expect(view.members.map(view => view.member.nickname)).toEqual(['Maman', 'Tata'])
  })

  it('rattache au compte vérifié par SMS, laisse en attente un numéro seulement saisi', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const payer = await createUserData(em, { name: 'Awa Diallo' })
    const verified = await createUserData(em, { name: 'Afiavi Kossou', phone: MAMAN_PHONE, phoneVerifiedAt: new Date() })
    await createUserData(em, { name: 'Rose Agbo', phone: TATA_PHONE, phoneVerifiedAt: null })
    await app.get(FamilyWalletsService).open(payer.id)
    const members = app.get(FamilyMembersService)

    const active = await members.add(payer.id, { relative: newRelative({ nickname: 'Maman', phone: MAMAN_PHONE }) })
    const pending = await members.add(payer.id, { relative: newRelative() })

    expect(active.status).toBe(FamilyMemberStatus.ACTIVE)
    expect(active.user?.id).toBe(verified.id)
    expect(pending.status).toBe(FamilyMemberStatus.PENDING)
    expect(pending.user ?? null).toBeNull()
    expect(pending.invitedAt).toBeInstanceOf(Date)

    // The active member heard of it in the app.
    const [notification] = await em.getConnection().execute(
      `SELECT type FROM notifications WHERE "userId" = ?`,
      [verified.id],
    ) as Array<{ type: string }>
    expect(notification?.type).toBe('FAMILY_WALLET_STATUS')
  })

  it('refuse le payeur lui-même, sans rien écrire dans le carnet', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const payer = await createUserData(em, { name: 'Awa Diallo', phone: MAMAN_PHONE, phoneVerifiedAt: new Date() })
    await app.get(FamilyWalletsService).open(payer.id)

    const result = await refusal(app.get(FamilyMembersService).add(payer.id, { relative: newRelative({ phone: MAMAN_PHONE }) }))

    expect(result).toEqual({ status: 400, code: 'FAMILY_MEMBER_IS_PAYER' })
    expect(await app.get(RelativesService).list(payer.id)).toHaveLength(0)
  })

  it('refuse un proche déjà membre, et le proche du carnet d\'un autre payeur', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const payer = await createUserData(em, { name: 'Awa Diallo' })
    const other = await createUserData(em, { name: 'Koffi Mensah' })
    await app.get(FamilyWalletsService).open(payer.id)
    const members = app.get(FamilyMembersService)
    const first = await members.add(payer.id, { relative: newRelative() })

    expect(await refusal(members.add(payer.id, { relative: newRelative({ nickname: 'Tantie' }) }))).toEqual({ status: 409, code: 'FAMILY_MEMBER_EXISTS' })
    expect(await refusal(members.add(payer.id, { savedRelativeId: first.savedRelative!.id }))).toEqual({ status: 409, code: 'FAMILY_MEMBER_EXISTS' })

    const theirs = await app.get(RelativesService).create(other.id, newRelative({ phone: MAMAN_PHONE }))
    expect((await refusal(members.add(payer.id, { savedRelativeId: theirs.id }))).status).toBe(404)
  })

  it('vire depuis le portefeuille personnel d\'un bloc, ou ne bouge rien', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const payer = await createUserData(em, { name: 'Awa Diallo' })
    const familyWallet = await app.get(FamilyWalletsService).open(payer.id)
    const walletService = app.get(WalletService)
    const personal = await walletService.getOrCreate({ userId: payer.id })
    await walletService.credit(personal.id, { type: WalletTransactionType.TOPUP, amount: 3_000, description: 'Recharge' })
    const funding = app.get(FamilyFundingService)

    expect(await refusal(funding.transferFromPersonal(payer.id, 5_000))).toEqual({ status: 400, code: 'INSUFFICIENT_BALANCE' })
    fresh(app)
    const family = await app.get(FamilyWalletsService).balanceWallet(familyWallet.id)
    expect(await walletService.getBalance(personal.id)).toBe(3_000)
    expect(Number(family.balance)).toBe(0)
    const [{ count }] = await em.getConnection().execute(
      `SELECT count(*)::int AS count FROM wallet_transactions WHERE type IN ('FAMILY_TRANSFER_OUT', 'FAMILY_TRANSFER_IN')`,
    ) as Array<{ count: number }>
    expect(count).toBe(0)

    expect(await refusal(funding.transferFromPersonal(payer.id, 999))).toEqual({ status: 400, code: 'FAMILY_TOPUP_AMOUNT' })

    await expect(funding.transferFromPersonal(payer.id, 2_000)).resolves.toEqual({ balance: 2_000, personalBalance: 1_000 })
    const lines = await em.getConnection().execute(
      `SELECT type, amount::float AS amount FROM wallet_transactions WHERE type IN ('FAMILY_TRANSFER_OUT', 'FAMILY_TRANSFER_IN') ORDER BY type`,
    ) as Array<{ type: string, amount: number }>
    expect(lines).toEqual([
      { type: 'FAMILY_TRANSFER_IN', amount: 2_000 },
      { type: 'FAMILY_TRANSFER_OUT', amount: -2_000 },
    ])
  })

  it('crédite une recharge par carte confirmée sur le portefeuille famille et prévient les membres actifs', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const payer = await createUserData(em, { name: 'Awa Diallo' })
    const maman = await createUserData(em, { name: 'Afiavi Kossou', phone: MAMAN_PHONE, phoneVerifiedAt: new Date() })
    const familyWallet = await app.get(FamilyWalletsService).open(payer.id)
    await app.get(FamilyMembersService).add(payer.id, { relative: newRelative({ nickname: 'Maman', phone: MAMAN_PHONE }) })
    await app.get(FamilyWalletsService).updateDefaults(payer.id, { defaults: { monthlyCap: 15_000 } })

    expect(await refusal(app.get(FamilyFundingService).initiateTopup(payer.id, 500_001))).toEqual({ status: 400, code: 'FAMILY_TOPUP_AMOUNT' })

    // What `initiate` leaves behind once the provider handed its reference.
    const family = await app.get(FamilyWalletsService).balanceWallet(familyWallet.id)
    const db = em.getConnection()
    await db.execute(
      `INSERT INTO wallet_topups (wallet_id, user_id, amount, status, fedapay_transaction_id, "createdAt", "updatedAt")
       VALUES (?, ?, 32000, 'PENDING', 'ref-famille', NOW(), NOW())`,
      [family.id, payer.id],
    )

    await app.get(TopupService).settleFromProvider('ref-famille', 'completed')
    // Replayed by the webhook or the cron: credited once.
    await app.get(TopupService).settleFromProvider('ref-famille', 'completed')

    fresh(app)
    const view = await app.get(FamilyWalletsService).get(payer.id)
    expect(view.balance).toBe(32_000)
    expect(await em.count(WalletTopup, { status: TopupStatus.COMPLETED })).toBe(1)
    const notifications = await db.execute(
      `SELECT body FROM notifications WHERE "userId" = ? AND type = 'FAMILY_WALLET_TOPUP'`,
      [maman.id],
    ) as Array<{ body: string }>
    expect(notifications).toHaveLength(1)
    // Her own figure, not the balance (FR-011).
    expect(notifications[0].body).toBe('Awa a rechargé le portefeuille famille. Vous pouvez dépenser 15 000 FCFA ce mois-ci.')
  })

  it('compte la dépense du mois du membre, remboursements déduits', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const payer = await createUserData(em, { name: 'Awa Diallo' })
    await createUserData(em, { name: 'Afiavi Kossou', phone: MAMAN_PHONE, phoneVerifiedAt: new Date() })
    const familyWallet = await app.get(FamilyWalletsService).open(payer.id)
    const member = await app.get(FamilyMembersService).add(payer.id, { relative: newRelative({ nickname: 'Maman', phone: MAMAN_PHONE }) })
    const family = await app.get(FamilyWalletsService).balanceWallet(familyWallet.id)
    const walletService = app.get(WalletService)
    await walletService.credit(family.id, { type: WalletTransactionType.TOPUP, amount: 20_000, description: 'Recharge' })
    await walletService.debit(family.id, { type: WalletTransactionType.ORDER_PAYMENT, amount: 6_800, description: 'Commande', familyMemberId: member.id })
    await walletService.debit(family.id, { type: WalletTransactionType.ORDER_PAYMENT, amount: 3_000, description: 'Commande', familyMemberId: member.id })
    await walletService.credit(family.id, { type: WalletTransactionType.REFUND, amount: 3_000, description: 'Remboursement', familyMemberId: member.id })
    // Last month's purchase does not count.
    await em.getConnection().execute(
      `INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, description, family_member_id, "createdAt")
       VALUES (?, 'ORDER_PAYMENT', -4000, 0, 'Mois dernier', ?, NOW() - interval '40 days')`,
      [family.id, member.id],
    )

    fresh(app)
    const view = await app.get(FamilyWalletsService).get(payer.id)

    expect(view.balance).toBe(13_200)
    expect(view.members[0].spentThisMonth).toBe(6_800)
  })
})
