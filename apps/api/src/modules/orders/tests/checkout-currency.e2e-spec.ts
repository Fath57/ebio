import type { EntityManager } from '@mikro-orm/postgresql'
import type { INestApplication } from '@nestjs/common'
import { EntityManager as NestEntityManager } from '@mikro-orm/postgresql'
import { beforeEach, describe, expect, it } from 'vitest'
import { createUserData } from '../../../factories/user.factory'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { EUR_OFFICIAL_PARITY } from '../../currency/currency.constants'
import { DeliveriesModule } from '../../deliveries/deliveries.module'
import { PlatformSettingsService } from '../../settings/platform-settings.service'
import { CheckoutService } from '../checkout.service'
import { OrdersController } from '../orders.controller'
import { OrdersModule } from '../orders.module'

/** Cotonou: one shop, the buyer's door a couple of kilometres away. */
const BOUTIQUE = { latitude: 6.3616, longitude: 2.4264 }
const PORTE = { latitude: 6.3700, longitude: 2.4300 }
const USD_XOF = 610.5
const MARGIN_BPS = 200

interface Fixture {
  buyerId: string
  productId: string
}

interface CheckoutRow {
  total_amount: number
  display_currency: string
  fx_rate: string | null
  fx_margin_bps: number | null
  display_total: string | null
}

async function seed(em: EntityManager): Promise<Fixture> {
  const buyer = await createUserData(em, { name: 'Awa Diallo', phone: '+33612345678' })
  const shopUser = await createUserData(em)
  await em.flush()
  const db = em.getConnection()

  // Read on every order, backed by no entity: the test schema lacks it.
  await db.execute(`CREATE TABLE IF NOT EXISTS "commission_rates" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "category_slug" varchar(50) NOT NULL UNIQUE,
    "rate" float NOT NULL,
    "created_at" timestamptz NOT NULL DEFAULT NOW(),
    "updated_at" timestamptz NOT NULL DEFAULT NOW(),
    CONSTRAINT "commission_rates_pkey" PRIMARY KEY ("id")
  );`)

  const [shop] = await db.execute(
    `INSERT INTO suppliers (user_id, shop_name, type, mode, validation_status, location, "createdAt", "updatedAt")
     VALUES (?, 'Fruits Fatou', 'TRANSFORMER', 'ORDER', 'VALIDATED', ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, NOW(), NOW())
     RETURNING id`,
    [shopUser.id, BOUTIQUE.longitude, BOUTIQUE.latitude],
  ) as Array<{ id: string }>
  const [category] = await db.execute(
    `INSERT INTO categories (name, slug, "createdAt", "updatedAt") VALUES ('Légumes', ?, NOW(), NOW()) RETURNING id`,
    [`legumes-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`],
  ) as Array<{ id: string }>
  const [product] = await db.execute(
    `INSERT INTO products (supplier_id, category_id, name, price_per_unit, unit, stock, status, "createdAt", "updatedAt")
     VALUES (?, ?, 'Tomates fraîches bio', 1200, 'KG', 50, 'ACTIVE', NOW(), NOW())
     RETURNING id`,
    [shop.id, category.id],
  ) as Array<{ id: string }>

  return { buyerId: buyer.id, productId: product.id }
}

function cart(fixture: Fixture, overrides: Record<string, unknown> = {}): Parameters<CheckoutService['create']>[1] {
  return {
    items: [{ productId: fixture.productId, quantity: 2 }],
    pickupMode: 'DELIVERY',
    paymentMethod: 'FEDAPAY',
    deliveryAddress: 'Cadjèhoun, portail bleu après la pharmacie',
    deliveryLatitude: PORTE.latitude,
    deliveryLongitude: PORTE.longitude,
    displayCurrency: 'XOF',
    ...overrides,
  } as Parameters<CheckoutService['create']>[1]
}

/** The amount shown, as the spec states it: rounded up to the cent, margin included. */
function expectedDisplay(totalXof: number, xofPerUnit: number): number {
  return Math.ceil(totalXof / (xofPerUnit * (1 - MARGIN_BPS / 10_000)) * 100) / 100
}

async function checkoutRow(em: EntityManager, checkoutId: string): Promise<CheckoutRow> {
  const [row] = await em.getConnection().execute(
    `SELECT total_amount, display_currency, fx_rate, fx_margin_bps, display_total FROM checkouts WHERE id = ?`,
    [checkoutId],
  ) as CheckoutRow[]
  return row
}

/** `GET /orders/:id` as the payer, with nothing remembered from the previous request. */
async function orderAsPayer(app: INestApplication, orderId: string, buyerId: string) {
  app.get(NestEntityManager).clear()
  const session = { user: { id: buyerId, role: 'BUYER' } } as Parameters<OrdersController['findById']>[0]
  return app.get(OrdersController).findById(session, orderId)
}

async function useRates(app: INestApplication, rates: { USD?: number, EUR?: number }): Promise<void> {
  const settings = app.get(PlatformSettingsService)
  await settings.setFxMarginBps(MARGIN_BPS)
  await settings.setExchangeRates(rates, 'MANUAL')
}

describe('passage en caisse dans une devise d\'affichage (e2e)', () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 4 }, {
      imports: [RolesModule, AuditModule, DeliveriesModule, OrdersModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('montre le total en dollars, marge comprise, et le fige sur le panier', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seed(em)
    await useRates(app, { USD: USD_XOF })
    const checkouts = app.get(CheckoutService)

    const preview = await checkouts.preview(fixture.buyerId, cart(fixture, { displayCurrency: 'USD' }))
    expect(preview.display).not.toBeNull()
    expect(preview.display!.currency).toBe('USD')
    expect(preview.display!.total).toBe(expectedDisplay(preview.total, USD_XOF))

    const created = await checkouts.create(fixture.buyerId, cart(fixture, { displayCurrency: 'USD' }))
    expect(created.display).not.toBeNull()
    expect(created.display!.total).toBe(preview.display!.total)

    const row = await checkoutRow(em, created.checkoutId)
    expect(Number(row.total_amount)).toBe(preview.total)
    expect(row.display_currency).toBe('USD')
    expect(Number(row.fx_rate)).toBeCloseTo(USD_XOF * 0.98, 6)
    expect(row.fx_margin_bps).toBe(MARGIN_BPS)
    expect(Number(row.display_total)).toBe(expectedDisplay(preview.total, USD_XOF))
  })

  it('garde le montant convenu quand le taux change après coup', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seed(em)
    await useRates(app, { USD: USD_XOF })
    const created = await app.get(CheckoutService).create(fixture.buyerId, cart(fixture, { displayCurrency: 'USD' }))
    const before = await orderAsPayer(app, created.orders[0].orderId, fixture.buyerId)
    expect(before.display).toEqual({
      currency: 'USD',
      rate: expect.closeTo(USD_XOF * 0.98, 6),
      total: created.display!.total,
    })

    await useRates(app, { USD: 550 })

    const row = await checkoutRow(em, created.checkoutId)
    expect(Number(row.display_total)).toBe(created.display!.total)
    expect(Number(row.fx_rate)).toBeCloseTo(USD_XOF * 0.98, 6)
    const after = await orderAsPayer(app, created.orders[0].orderId, fixture.buyerId)
    expect(after.display).toEqual(before.display)
  })

  it('ne fige rien quand le payeur reste en FCFA', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seed(em)
    await useRates(app, { USD: USD_XOF })

    const created = await app.get(CheckoutService).create(fixture.buyerId, cart(fixture))
    expect(created.display).toBeNull()

    const row = await checkoutRow(em, created.checkoutId)
    expect(row.display_currency).toBe('XOF')
    expect(row.fx_rate).toBeNull()
    expect(row.fx_margin_bps).toBeNull()
    expect(row.display_total).toBeNull()
    const order = await orderAsPayer(app, created.orders[0].orderId, fixture.buyerId)
    expect(order.display).toBeNull()
  })

  it('convertit en euros à la parité fixe quand aucun taux n\'est enregistré', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seed(em)
    await app.get(PlatformSettingsService).setFxMarginBps(MARGIN_BPS)

    const created = await app.get(CheckoutService).create(fixture.buyerId, cart(fixture, { displayCurrency: 'EUR' }))

    const row = await checkoutRow(em, created.checkoutId)
    expect(row.display_currency).toBe('EUR')
    expect(Number(row.fx_rate)).toBeCloseTo(EUR_OFFICIAL_PARITY * 0.98, 6)
    expect(Number(row.display_total)).toBe(expectedDisplay(Number(row.total_amount), EUR_OFFICIAL_PARITY))
    expect(created.display!.total).toBe(Number(row.display_total))
  })

  it('encaisse le même montant en FCFA quelle que soit la devise affichée', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seed(em)
    await useRates(app, { USD: USD_XOF })
    const db = em.getConnection()
    await db.execute(
      `INSERT INTO wallets (user_id, balance, "createdAt", "updatedAt") VALUES (?, 50000, NOW(), NOW())`,
      [fixture.buyerId],
    )
    const checkouts = app.get(CheckoutService)

    const inFcfa = await checkouts.create(fixture.buyerId, cart(fixture, { paymentMethod: 'WALLET' }))
    // The same basket twice in two minutes is refused as a double tap; another
    // basket would change the amount. The first order is aged instead.
    await db.execute(
      `UPDATE orders SET "createdAt" = NOW() - interval '5 minutes' WHERE checkout_id = ?`,
      [inFcfa.checkoutId],
    )
    const inDollars = await checkouts.create(fixture.buyerId, cart(fixture, { paymentMethod: 'WALLET', displayCurrency: 'USD' }))

    const fcfaRow = await checkoutRow(em, inFcfa.checkoutId)
    const dollarRow = await checkoutRow(em, inDollars.checkoutId)
    expect(Number(dollarRow.total_amount)).toBe(Number(fcfaRow.total_amount))
    expect(inDollars.orders.map(order => order.total)).toEqual(inFcfa.orders.map(order => order.total))

    const payments = await db.execute(
      `SELECT checkout_id, SUM(amount)::int AS paid FROM payments WHERE checkout_id IN (?, ?) GROUP BY checkout_id`,
      [inFcfa.checkoutId, inDollars.checkoutId],
    ) as Array<{ checkout_id: string, paid: number }>
    expect(payments).toHaveLength(2)
    for (const payment of payments) {
      expect(payment.paid).toBe(Number(fcfaRow.total_amount))
    }

    const [wallet] = await db.execute(`SELECT balance FROM wallets WHERE user_id = ?`, [fixture.buyerId]) as Array<{ balance: string }>
    expect(Number(wallet.balance)).toBe(50000 - 2 * Number(fcfaRow.total_amount))
  })
})
