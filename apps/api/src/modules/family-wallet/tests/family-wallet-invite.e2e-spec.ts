import type { INestApplication } from '@nestjs/common'
import { EntityManager } from '@mikro-orm/postgresql'
import { beforeEach, describe, expect, it } from 'vitest'
import { createUserData } from '../../../factories/user.factory'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { OtpAuthService } from '../../auth/otp-auth.service'
import { RolesModule } from '../../auth/roles/roles.module'
import { FamilyMemberStatus, FamilyWalletMember } from '../entities/family-wallet-member.entity'
import { FamilyMembersService } from '../family-members.service'
import { FamilyPendingScheduler } from '../family-pending.scheduler'
import { FamilyWalletModule } from '../family-wallet.module'
import { FamilyWalletsService } from '../family-wallets.service'

const MAMAN_PHONE = '+2290197000001'
const TATA_PHONE = '+2290196000002'
const DAY_MS = 24 * 60 * 60 * 1000

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

async function addPending(app: INestApplication, payerId: string, nickname: string, phone: string): Promise<FamilyWalletMember> {
  return app.get(FamilyMembersService).add(payerId, { relative: { nickname, name: nickname, phone, address: null, latitude: null, longitude: null } })
}

async function notificationsOf(em: EntityManager, userId: string, type: string): Promise<string[]> {
  const rows = await em.getConnection().execute(
    `SELECT body FROM notifications WHERE "userId" = ? AND type = ? ORDER BY "createdAt"`,
    [userId, type],
  ) as Array<{ body: string }>
  return rows.map(row => row.body)
}

/**
 * US6: a relative without an account is invited by SMS and joins when they
 * sign up with that number proven by SMS; the payer hears it, may resend the
 * invitation once a day, and is reminded once after 30 days.
 */
describe('portefeuille famille — invitation (e2e)', () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 4 }, {
      imports: [RolesModule, AuditModule, FamilyWalletModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('rattache le membre en attente à l\'inscription par SMS et prévient le payeur', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const payer = await createUserData(em, { name: 'Awa Diallo' })
    await app.get(FamilyWalletsService).open(payer.id)
    const pending = await addPending(app, payer.id, 'Maman', MAMAN_PHONE)
    const other = await addPending(app, payer.id, 'Tata', TATA_PHONE)
    expect(pending.status).toBe(FamilyMemberStatus.PENDING)

    const { user } = await app.get(OtpAuthService).registerWithPhone(MAMAN_PHONE, 'Afiavi Kossou', 'motdepasse-solide')

    fresh(app)
    const linked = await em.fork().findOneOrFail(FamilyWalletMember, { id: pending.id })
    expect(linked.status).toBe(FamilyMemberStatus.ACTIVE)
    expect(linked.user?.id).toBe(user.id)
    expect((await em.fork().findOneOrFail(FamilyWalletMember, { id: other.id })).status).toBe(FamilyMemberStatus.PENDING)
    expect(await notificationsOf(em, payer.id, 'FAMILY_WALLET_MEMBER_JOINED')).toEqual(['Maman a rejoint votre portefeuille famille.'])
  })

  it('ne rattache pas un numéro seulement saisi dans un profil', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const payer = await createUserData(em, { name: 'Awa Diallo' })
    await createUserData(em, { name: 'Rose Agbo', phone: TATA_PHONE, phoneVerifiedAt: null })
    await app.get(FamilyWalletsService).open(payer.id)

    const member = await addPending(app, payer.id, 'Tata', TATA_PHONE)
    // Another number proven by SMS links nothing either.
    await app.get(OtpAuthService).registerWithPhone(MAMAN_PHONE, 'Afiavi Kossou', 'motdepasse-solide')

    fresh(app)
    const reread = await em.fork().findOneOrFail(FamilyWalletMember, { id: member.id })
    expect(reread.status).toBe(FamilyMemberStatus.PENDING)
    expect(reread.user ?? null).toBeNull()
    expect(await notificationsOf(em, payer.id, 'FAMILY_WALLET_MEMBER_JOINED')).toEqual([])
  })

  it('renvoie l\'invitation une fois par 24 heures, à un membre en attente seulement', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const payer = await createUserData(em, { name: 'Awa Diallo' })
    await createUserData(em, { name: 'Afiavi Kossou', phone: MAMAN_PHONE, phoneVerifiedAt: new Date() })
    await app.get(FamilyWalletsService).open(payer.id)
    const members = app.get(FamilyMembersService)
    const pending = await addPending(app, payer.id, 'Tata', TATA_PHONE)
    const active = await addPending(app, payer.id, 'Maman', MAMAN_PHONE)

    expect(await refusal(members.resendInvitation(payer.id, pending.id))).toEqual({ status: 429, code: 'FAMILY_INVITE_TOO_SOON' })
    expect(await refusal(members.resendInvitation(payer.id, active.id))).toEqual({ status: 409, code: 'FAMILY_MEMBER_NOT_PENDING' })

    await em.getConnection().execute(`UPDATE family_wallet_members SET invited_at = NOW() - interval '25 hours' WHERE id = ?`, [pending.id])
    fresh(app)
    const now = new Date()
    const resent = await members.resendInvitation(payer.id, pending.id, now)

    expect(resent.invitedAt?.getTime()).toBe(now.getTime())
    expect(await refusal(members.resendInvitation(payer.id, pending.id))).toEqual({ status: 429, code: 'FAMILY_INVITE_TOO_SOON' })
  })

  it('rappelle au payeur un membre en attente depuis 30 jours, une seule fois', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const payer = await createUserData(em, { name: 'Awa Diallo' })
    await app.get(FamilyWalletsService).open(payer.id)
    const old = await addPending(app, payer.id, 'Tata', TATA_PHONE)
    const recent = await addPending(app, payer.id, 'Maman', MAMAN_PHONE)
    await em.getConnection().execute(`UPDATE family_wallet_members SET created_at = NOW() - interval '31 days' WHERE id = ?`, [old.id])
    await em.getConnection().execute(`UPDATE family_wallet_members SET created_at = NOW() - interval '10 days' WHERE id = ?`, [recent.id])
    fresh(app)
    const scheduler = app.get(FamilyPendingScheduler)

    expect(await scheduler.remind(new Date())).toBe(1)
    fresh(app)
    expect(await scheduler.remind(new Date(Date.now() + DAY_MS))).toBe(0)

    expect(await notificationsOf(em, payer.id, 'FAMILY_WALLET_MEMBER_PENDING')).toEqual(['Tata n\'a pas encore installé eBio. Renvoyer l\'invitation ?'])
    const reread = await em.fork().findOneOrFail(FamilyWalletMember, { id: old.id })
    expect(reread.pendingRemindedAt).toBeInstanceOf(Date)
  })
})
