import type { EntityManager } from '@mikro-orm/postgresql'
import type { INestApplication } from '@nestjs/common'
import { BadRequestException } from '@nestjs/common'
import { beforeEach, describe, expect, it } from 'vitest'
import { createUserData } from '../../../factories/user.factory'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { DeliveriesModule } from '../../deliveries/deliveries.module'
import { Notification, NotificationType } from '../../notifications/notification.entity'
import { CheckoutService } from '../checkout.service'
import { OrdersModule } from '../orders.module'
import { OrdersService } from '../orders.service'

interface Fixture {
  buyerId: string
  shopUserId: string
  productId: string
}

async function seed(em: EntityManager): Promise<Fixture> {
  const buyer = await createUserData(em)
  const shopUser = await createUserData(em)
  await em.flush()

  const db = em.getConnection()

  // No entity backs this table, so the test schema does not have it, and the
  // service reads it on every order.
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
     VALUES (?, 'Fruits Fatou', 'TRANSFORMER', 'ORDER', 'VALIDATED',
             ST_SetSRID(ST_MakePoint(2.4264, 6.3616), 4326)::geography, NOW(), NOW())
     RETURNING id`,
    [shopUser.id],
  ) as Array<{ id: string }>

  const [category] = await db.execute(
    `INSERT INTO categories (name, slug, "createdAt", "updatedAt")
     VALUES ('Légumes', ?, NOW(), NOW())
     RETURNING id`,
    [`legumes-${Date.now()}`],
  ) as Array<{ id: string }>

  const [product] = await db.execute(
    `INSERT INTO products (supplier_id, category_id, name, price_per_unit, unit, stock, status, "createdAt", "updatedAt")
     VALUES (?, ?, 'Tomates fraîches bio', 1200, 'KG', 50, 'ACTIVE', NOW(), NOW())
     RETURNING id`,
    [shop.id, category.id],
  ) as Array<{ id: string }>

  return { buyerId: buyer.id, shopUserId: shopUser.id, productId: product.id }
}

/** An order already sitting at READY, in the given pickup mode. */
async function readyOrder(app: INestApplication, em: EntityManager, fixture: Fixture, pickupMode: 'ON_SITE' | 'DELIVERY'): Promise<string> {
  const delivery = pickupMode === 'DELIVERY'
    ? { deliveryAddress: 'Cadjehoun', deliveryLatitude: 6.37, deliveryLongitude: 2.43 }
    : {}
  const { checkoutId } = await app.get(CheckoutService).create(fixture.buyerId, {
    items: [{ productId: fixture.productId, quantity: 1 }],
    pickupMode,
    paymentMethod: 'CASH_ON_DELIVERY',
    ...delivery,
  } as Parameters<CheckoutService['create']>[1])

  const [row] = await em.getConnection().execute(
    `UPDATE orders SET status = 'READY' WHERE checkout_id = ? RETURNING id`,
    [checkoutId],
  ) as Array<{ id: string }>
  return row.id
}

async function readOrder(em: EntityManager, id: string): Promise<{ status: string, delivered_at: Date | null, delivery_confirmed_by_supplier: boolean }> {
  const [row] = await em.getConnection().execute(
    `SELECT status, delivered_at, delivery_confirmed_by_supplier FROM orders WHERE id = ?`,
    [id],
  ) as Array<{ status: string, delivered_at: Date | null, delivery_confirmed_by_supplier: boolean }>
  return row
}

/**
 * An on-site order has no IN_DELIVERY step, so the shop closes it from READY.
 * Until this was allowed the shop's button always failed, and the order could
 * never reach DELIVERED, which the invoice and the shop's payout both wait for.
 */
describe('remise au client d\'une commande en retrait (e2e)', () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 4 }, {
      imports: [RolesModule, AuditModule, DeliveriesModule, OrdersModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('laisse le fournisseur clôturer une commande prête', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seed(em)
    const orderId = await readyOrder(app, em, fixture, 'ON_SITE')

    await app.get(OrdersService).confirmDelivery(orderId, fixture.shopUserId)

    const order = await readOrder(em, orderId)
    expect(order.status).toBe('DELIVERED')
    expect(order.delivered_at).not.toBeNull()
    expect(order.delivery_confirmed_by_supplier).toBe(true)

    // The buyer collected it: « livrée » would describe a delivery that never happened.
    const notice = await em.fork().findOneOrFail(Notification, {
      user: fixture.buyerId,
      type: NotificationType.ORDER_DELIVERED,
    })
    expect(notice.title).toBe('Commande remise')
    expect(notice.body).toContain('vous a été remise')
  })

  it('refuse que l\'acheteur se déclare servi avant la remise', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seed(em)
    const orderId = await readyOrder(app, em, fixture, 'ON_SITE')

    await expect(app.get(OrdersService).confirmDelivery(orderId, fixture.buyerId))
      .rejects
      .toBeInstanceOf(BadRequestException)

    expect((await readOrder(em, orderId)).status).toBe('READY')
  })

  it('garde le passage par un livreur pour une commande à livrer', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seed(em)
    const orderId = await readyOrder(app, em, fixture, 'DELIVERY')

    await expect(app.get(OrdersService).confirmDelivery(orderId, fixture.shopUserId))
      .rejects
      .toBeInstanceOf(BadRequestException)

    expect((await readOrder(em, orderId)).status).toBe('READY')
  })
})
