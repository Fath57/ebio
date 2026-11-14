import type { INestApplication } from '@nestjs/common'
import { EntityManager } from '@mikro-orm/postgresql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { DeliveriesModule } from '../../deliveries/deliveries.module'
import { CheckoutService } from '../../orders/checkout.service'
import { OrdersModule } from '../../orders/orders.module'
import { FamilyWalletModule } from '../family-wallet.module'
import { balanceOf, familyCart, refusalOf, seedFamily } from './family-checkout.fixture'

/** As a fresh request would: nothing remembered from the previous one. */
function fresh(app: INestApplication): void {
  app.get(EntityManager).clear()
}

/**
 * Limits are set straight in the database: the payer's edit route (T035) is
 * tested on its own; here only their effect on payment counts.
 */
async function setDefaults(em: EntityManager, familyWalletId: string, defaults: { monthlyCap?: number | null, orderMax?: number | null, categoryIds?: string[] | null }): Promise<void> {
  await em.getConnection().execute(
    `UPDATE family_wallets SET default_monthly_cap = ?, default_order_max = ?, default_category_ids = ?::uuid[] WHERE id = ?`,
    [defaults.monthlyCap ?? null, defaults.orderMax ?? null, defaults.categoryIds ? `{${defaults.categoryIds.join(',')}}` : null, familyWalletId],
  )
}

async function setMemberCap(em: EntityManager, memberId: string, monthlyCap: number | null): Promise<void> {
  await em.getConnection().execute(`UPDATE family_wallet_members SET monthly_cap = ? WHERE id = ?`, [monthlyCap, memberId])
}

/** US3: what each member may spend, per month, per order and on which products. */
describe('portefeuille famille, limites au paiement (e2e)', { timeout: 30_000 }, () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 6 }, {
      imports: [RolesModule, AuditModule, DeliveriesModule, OrdersModule, FamilyWalletModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('applique le plafond par défaut (2 000) et le plafond propre d\'un membre (4 000)', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seedFamily(app, em, { balance: 20_000, price: 1_500 })
    await setDefaults(em, fixture.familyWalletId, { monthlyCap: 2_000 })
    await setMemberCap(em, fixture.maman.memberId, 4_000)
    const checkouts = app.get(CheckoutService)

    const tataPreview = await checkouts.preview(fixture.tata.userId, familyCart(fixture.productIds[0], fixture.tata.memberId, 2))
    expect(tataPreview.familyWallets[0]).toMatchObject({ usable: false, reason: 'MONTHLY_CAP', spendable: 2_000 })
    const mamanPreview = await checkouts.preview(fixture.maman.userId, familyCart(fixture.productIds[0], fixture.maman.memberId, 2))
    expect(mamanPreview.familyWallets[0]).toMatchObject({ usable: true, reason: null, spendable: 4_000 })

    const tata = await refusalOf(checkouts.create(fixture.tata.userId, familyCart(fixture.productIds[0], fixture.tata.memberId, 2)))
    expect(tata.body).toMatchObject({ code: 'FAMILY_WALLET_REFUSED', reason: 'MONTHLY_CAP' })
    await checkouts.create(fixture.maman.userId, familyCart(fixture.productIds[0], fixture.maman.memberId, 2))
    fresh(app)
    expect(await balanceOf(em, fixture.balanceWalletId)).toBe(17_000)
  })

  it('refuse au-delà du plafond du mois, puis accepte le mois suivant', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-20T10:00:00Z'))
    const fixture = await seedFamily(app, em, { balance: 20_000, price: 1_500 })
    await setMemberCap(em, fixture.maman.memberId, 4_000)
    const checkouts = app.get(CheckoutService)

    await checkouts.create(fixture.maman.userId, familyCart(fixture.productIds[0], fixture.maman.memberId, 2))
    const again = await refusalOf(checkouts.create(fixture.maman.userId, familyCart(fixture.productIds[1], fixture.maman.memberId, 2)))
    expect(again.body).toMatchObject({ code: 'FAMILY_WALLET_REFUSED', reason: 'MONTHLY_CAP' })

    // 1 December, 00:30 in Cotonou (23:30 UTC the day before): a new month.
    vi.setSystemTime(new Date('2026-11-30T23:30:00Z'))
    fresh(app)
    await checkouts.create(fixture.maman.userId, familyCart(fixture.productIds[1], fixture.maman.memberId, 2))
    fresh(app)
    expect(await balanceOf(em, fixture.balanceWalletId)).toBe(14_000)
  })

  it('refuse une commande au-delà du maximum par commande', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seedFamily(app, em, { balance: 20_000, price: 1_500 })
    await setDefaults(em, fixture.familyWalletId, { orderMax: 2_500 })
    const checkouts = app.get(CheckoutService)

    const refused = await refusalOf(checkouts.create(fixture.maman.userId, familyCart(fixture.productIds[0], fixture.maman.memberId, 2)))
    expect(refused.body).toMatchObject({ code: 'FAMILY_WALLET_REFUSED', reason: 'ORDER_MAX' })
    // A smaller order still goes through: the maximum bounds one order, not the month.
    await checkouts.create(fixture.maman.userId, familyCart(fixture.productIds[0], fixture.maman.memberId, 1))
    fresh(app)
    expect(await balanceOf(em, fixture.balanceWalletId)).toBe(18_500)
  })

  it('refuse une catégorie non autorisée et signale les produits en cause', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seedFamily(app, em, { balance: 20_000, price: 1_500 })
    await setDefaults(em, fixture.familyWalletId, { categoryIds: [fixture.otherCategoryId] })
    const checkouts = app.get(CheckoutService)

    const preview = await checkouts.preview(fixture.maman.userId, familyCart(fixture.productIds[0], fixture.maman.memberId, 2))
    expect(preview.familyWallets[0]).toMatchObject({ usable: false, reason: 'CATEGORY', blockedProductIds: [fixture.productIds[0]] })

    const refused = await refusalOf(checkouts.create(fixture.maman.userId, familyCart(fixture.productIds[0], fixture.maman.memberId, 2)))
    expect(refused.body).toMatchObject({ code: 'FAMILY_WALLET_REFUSED', reason: 'CATEGORY', blockedProductIds: [fixture.productIds[0]] })

    // Allowed again: the same cart passes.
    await setDefaults(em, fixture.familyWalletId, { categoryIds: [fixture.otherCategoryId, fixture.categoryId] })
    fresh(app)
    await checkouts.create(fixture.maman.userId, familyCart(fixture.productIds[0], fixture.maman.memberId, 2))
  })

  it('une modification des limites ne touche pas une commande déjà payée', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seedFamily(app, em, { balance: 20_000, price: 1_500 })
    await setMemberCap(em, fixture.maman.memberId, 4_000)
    const checkouts = app.get(CheckoutService)
    const paid = await checkouts.create(fixture.maman.userId, familyCart(fixture.productIds[0], fixture.maman.memberId, 2))

    await setMemberCap(em, fixture.maman.memberId, 2_000)
    fresh(app)

    const [checkout] = await em.getConnection().execute(
      `SELECT c.status, p.status AS payment_status FROM checkouts c JOIN payments p ON p.checkout_id = c.id WHERE c.id = ?`,
      [paid.checkoutId],
    ) as Array<{ status: string, payment_status: string }>
    expect(checkout).toEqual({ status: 'PAID', payment_status: 'ESCROW' })
    expect(await balanceOf(em, fixture.balanceWalletId)).toBe(17_000)

    // The next order is weighed against the new cap: 3 000 already spent.
    const next = await refusalOf(checkouts.create(fixture.maman.userId, familyCart(fixture.productIds[1], fixture.maman.memberId, 1)))
    expect(next.body).toMatchObject({ code: 'FAMILY_WALLET_REFUSED', reason: 'MONTHLY_CAP' })
  })
})
