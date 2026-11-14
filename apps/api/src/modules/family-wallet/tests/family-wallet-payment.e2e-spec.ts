import type { INestApplication } from '@nestjs/common'
import { EntityManager } from '@mikro-orm/postgresql'
import { beforeEach, describe, expect, it } from 'vitest'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { DeliveriesModule } from '../../deliveries/deliveries.module'
import { CheckoutService } from '../../orders/checkout.service'
import { OrdersModule } from '../../orders/orders.module'
import { OrdersService } from '../../orders/orders.service'
import { CompensationService } from '../../payments/compensation.service'
import { spentThisMonth } from '../family-payment.service'
import { FamilyWalletModule } from '../family-wallet.module'
import { FamilyWalletsService } from '../family-wallets.service'
import { balanceOf, familyCart, notificationsOf, personalBalanceOf, refusalOf, seedFamily } from './family-checkout.fixture'

/** As a fresh request would: nothing remembered from the previous one. */
function fresh(app: INestApplication): void {
  app.get(EntityManager).clear()
}

/**
 * US2: a member pays their cart from the family wallet; a cancelled order
 * gives the money, and the member's month, back to the wallet, or to the
 * payer once the wallet is closed.
 */
describe('portefeuille famille, paiement au passage en caisse (e2e)', { timeout: 30_000 }, () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 6 }, {
      imports: [RolesModule, AuditModule, DeliveriesModule, OrdersModule, FamilyWalletModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('paie le panier, écrit le séquestre et prévient le payeur', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seedFamily(app, em, { balance: 10_000, price: 1_500 })
    const checkouts = app.get(CheckoutService)

    const preview = await checkouts.preview(fixture.maman.userId, familyCart(fixture.productIds[0], fixture.maman.memberId, 2))
    expect(preview.familyWallets).toEqual([
      { memberId: fixture.maman.memberId, payerFirstName: 'Awa', spendable: 10_000, usable: true, reason: null },
    ])

    const result = await checkouts.create(fixture.maman.userId, familyCart(fixture.productIds[0], fixture.maman.memberId, 2))
    fresh(app)

    const [checkout] = await em.getConnection().execute(
      `SELECT status, payment_method, family_member_id, total_amount FROM checkouts WHERE id = ?`,
      [result.checkoutId],
    ) as Array<Record<string, unknown>>
    expect(checkout).toMatchObject({ status: 'PAID', payment_method: 'FAMILY_WALLET', family_member_id: fixture.maman.memberId })
    expect(Number(checkout.total_amount)).toBe(3_000)

    const payments = await em.getConnection().execute(
      `SELECT status, payment_method, amount FROM payments WHERE checkout_id = ?`,
      [result.checkoutId],
    ) as Array<Record<string, unknown>>
    expect(payments).toHaveLength(1)
    expect(payments[0]).toMatchObject({ status: 'ESCROW', payment_method: 'FAMILY_WALLET' })

    const ledger = await em.getConnection().execute(
      `SELECT type, amount, family_member_id FROM wallet_transactions WHERE wallet_id = ? AND type = 'ORDER_PAYMENT'`,
      [fixture.balanceWalletId],
    ) as Array<Record<string, unknown>>
    expect(ledger).toHaveLength(1)
    expect(ledger[0].family_member_id).toBe(fixture.maman.memberId)
    expect(Number(ledger[0].amount)).toBe(-3_000)

    expect(await balanceOf(em, fixture.balanceWalletId)).toBe(7_000)
    expect(await personalBalanceOf(em, fixture.maman.userId)).toBe(0)
    expect(await spentThisMonth(em, fixture.maman.memberId, new Date())).toBe(3_000)

    const told = await notificationsOf(em, fixture.payerId, 'FAMILY_WALLET_PURCHASE')
    expect(told.map(row => row.body)).toEqual(['Maman a commandé chez Ferme Bio Tori : 3 000 FCFA.'])
    // 7 000 left, above the 5 000 threshold: no alert yet.
    expect(await notificationsOf(em, fixture.payerId, 'FAMILY_WALLET_LOW_BALANCE')).toEqual([])
  })

  it('alerte le payeur une seule fois quand le solde passe sous le seuil', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seedFamily(app, em, { balance: 10_000, price: 1_500 })
    const checkouts = app.get(CheckoutService)

    await checkouts.create(fixture.maman.userId, familyCart(fixture.productIds[0], fixture.maman.memberId, 4))
    await checkouts.create(fixture.tata.userId, familyCart(fixture.productIds[1], fixture.tata.memberId, 1))
    fresh(app)

    // 10 000 − 6 000 = 4 000, under 5 000: one alert; − 1 500 = 2 500, still under: none more.
    const alerts = await notificationsOf(em, fixture.payerId, 'FAMILY_WALLET_LOW_BALANCE')
    expect(alerts.map(row => row.body)).toEqual(['Il reste 4 000 FCFA dans votre portefeuille famille.'])
  })

  it('refuse un solde insuffisant sans rien laisser derrière', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seedFamily(app, em, { balance: 2_000, price: 1_500 })
    const checkouts = app.get(CheckoutService)

    const preview = await checkouts.preview(fixture.maman.userId, familyCart(fixture.productIds[0], fixture.maman.memberId, 2))
    expect(preview.familyWallets[0]).toMatchObject({ usable: false, reason: 'INSUFFICIENT', spendable: 2_000 })

    const refused = await refusalOf(checkouts.create(fixture.maman.userId, familyCart(fixture.productIds[0], fixture.maman.memberId, 2)))
    expect(refused.status).toBe(400)
    expect(refused.body).toMatchObject({ code: 'FAMILY_WALLET_REFUSED', reason: 'INSUFFICIENT' })
    fresh(app)

    expect(await balanceOf(em, fixture.balanceWalletId)).toBe(2_000)
    const [{ count }] = await em.getConnection().execute(
      `SELECT COUNT(*)::int AS count FROM orders WHERE buyer_id = ?`,
      [fixture.maman.userId],
    ) as Array<{ count: number }>
    expect(count).toBe(0)
  })

  it('rend le solde et la dépense du mois quand la commande est annulée', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seedFamily(app, em, { balance: 10_000, price: 1_500 })
    const result = await app.get(CheckoutService).create(fixture.maman.userId, familyCart(fixture.productIds[0], fixture.maman.memberId, 2))
    fresh(app)

    const compensation = await app.get(CompensationService).compensateOrder(result.orders[0].orderId, 'Rupture de stock')
    fresh(app)

    expect(compensation.amount).toBe(3_000)
    expect(await balanceOf(em, fixture.balanceWalletId)).toBe(10_000)
    expect(await personalBalanceOf(em, fixture.maman.userId)).toBe(0)
    expect(await spentThisMonth(em, fixture.maman.memberId, new Date())).toBe(0)
    const [refund] = await em.getConnection().execute(
      `SELECT family_member_id FROM wallet_transactions WHERE wallet_id = ? AND type = 'REFUND'`,
      [fixture.balanceWalletId],
    ) as Array<{ family_member_id: string | null }>
    expect(refund.family_member_id).toBe(fixture.maman.memberId)
    const told = await notificationsOf(em, fixture.maman.userId, 'ORDER_REJECTED')
    expect(told[0].body).toContain('sur le portefeuille famille')
  })

  it('rembourse le portefeuille personnel du payeur une fois le portefeuille famille fermé', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seedFamily(app, em, { balance: 10_000, price: 1_500 })
    const result = await app.get(CheckoutService).create(fixture.maman.userId, familyCart(fixture.productIds[0], fixture.maman.memberId, 2))
    fresh(app)

    await app.get(FamilyWalletsService).close(fixture.payerId)
    fresh(app)
    expect(await personalBalanceOf(em, fixture.payerId)).toBe(7_000)

    await app.get(CompensationService).compensateOrder(result.orders[0].orderId, 'Boutique fermée')
    fresh(app)

    expect(await personalBalanceOf(em, fixture.payerId)).toBe(10_000)
    expect(await balanceOf(em, fixture.balanceWalletId)).toBe(0)
    expect(await personalBalanceOf(em, fixture.maman.userId)).toBe(0)
  })

  it('refuse une commande pour un proche, et une commande isolée hors passage en caisse', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seedFamily(app, em, { balance: 10_000, price: 1_500 })

    const gift = await refusalOf(app.get(CheckoutService).create(fixture.maman.userId, familyCart(fixture.productIds[0], fixture.maman.memberId, 2, {
      pickupMode: 'DELIVERY',
      deliveryAddress: 'Cadjèhoun, portail bleu après la pharmacie',
      deliveryLatitude: 6.37,
      deliveryLongitude: 2.43,
      recipient: { name: 'Rose Agbo', phone: '+2290195000003' },
    })))
    expect(gift).toMatchObject({ status: 400, body: { code: 'FAMILY_WALLET_WITH_RECIPIENT' } })

    const lone = await refusalOf(app.get(OrdersService).create(fixture.maman.userId, {
      supplierId: '7f1c1a4e-8b4b-4c55-9a52-1f8d2b8f5a10',
      items: [{ productId: fixture.productIds[0], quantity: 1 }],
      pickupMode: 'ON_SITE',
      paymentMethod: 'FAMILY_WALLET',
    } as Parameters<OrdersService['create']>[1]))
    expect(lone.status).toBe(400)

    // Someone else's membership cannot pay.
    const foreign = await refusalOf(app.get(CheckoutService).create(fixture.tata.userId, familyCart(fixture.productIds[0], fixture.maman.memberId, 2)))
    expect(foreign).toMatchObject({ status: 404, body: { code: 'FAMILY_MEMBER_NOT_FOUND' } })
    expect(await balanceOf(em, fixture.balanceWalletId)).toBe(10_000)
  })
})
