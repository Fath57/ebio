import type { EntityManager } from '@mikro-orm/postgresql'
import type { INestApplication } from '@nestjs/common'
import { beforeEach, describe, expect, it } from 'vitest'
import { createUserData } from '../../../factories/user.factory'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { DeliveriesModule } from '../../deliveries/deliveries.module'
import { DeliveriesService } from '../../deliveries/deliveries.service'
import { CheckoutService } from '../checkout.service'
import { Order } from '../entities/order.entity'
import { OrdersModule } from '../orders.module'

/** Cotonou: one shop, a buyer a couple of kilometres away. */
const BOUTIQUE = { latitude: 6.3616, longitude: 2.4264 }
const ACHETEUR = { latitude: 6.3700, longitude: 2.4300 }

interface Fixture {
  buyerId: string
  supplierId: string
  productId: string
  otherProductId: string
}

async function seed(em: EntityManager): Promise<Fixture> {
  const buyer = await createUserData(em)
  const shopUser = await createUserData(em)
  await em.flush()

  const db = em.getConnection()

  // Commission rates live in a table no entity backs, so the schema the tests
  // build from the entities does not have it. The service reads it on every
  // order; without the table the checkout dies before it decides anything.
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
             ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, NOW(), NOW())
     RETURNING id`,
    [shopUser.id, BOUTIQUE.longitude, BOUTIQUE.latitude],
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

  // A second shop, to prove a mixed basket is turned away.
  const otherUser = await createUserData(em)
  await em.flush()
  const [otherShop] = await db.execute(
    `INSERT INTO suppliers (user_id, shop_name, type, mode, validation_status, location, "createdAt", "updatedAt")
     VALUES (?, 'Huiles Koffi', 'TRANSFORMER', 'ORDER', 'VALIDATED',
             ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, NOW(), NOW())
     RETURNING id`,
    [otherUser.id, BOUTIQUE.longitude + 0.01, BOUTIQUE.latitude],
  ) as Array<{ id: string }>

  const [otherProduct] = await db.execute(
    `INSERT INTO products (supplier_id, category_id, name, price_per_unit, unit, stock, status, "createdAt", "updatedAt")
     VALUES (?, ?, 'Huile rouge', 900, 'L', 30, 'ACTIVE', NOW(), NOW())
     RETURNING id`,
    [otherShop.id, category.id],
  ) as Array<{ id: string }>

  return {
    buyerId: buyer.id,
    supplierId: shop.id,
    productId: product.id,
    otherProductId: otherProduct.id,
  }
}

/**
 * A cart holds one shop, so a checkout wraps one order.
 *
 * This is the shape carts went back to after the unified cart: mixing shops
 * refused every promo code (a code belongs to one shop), let a slow shop hold
 * up another's delivery, and put one payment across several orders. What is
 * checked here is what that reversal actually rests on — that the fee lands on
 * the order, and that no round is opened around a single delivery.
 */
describe('caisse d\'une seule boutique (e2e)', () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 4 }, {
      imports: [RolesModule, AuditModule, DeliveriesModule, OrdersModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('pose le frais de livraison sur la commande, et n\'ouvre aucune tournée', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seed(em)
    const checkouts = app.get(CheckoutService)
    const db = em.getConnection()

    const result = await checkouts.create(fixture.buyerId, {
      items: [{ productId: fixture.productId, quantity: 2 }],
      pickupMode: 'DELIVERY',
      paymentMethod: 'CASH_ON_DELIVERY',
      deliveryAddress: 'Cadjehoun, près de la pharmacie',
      deliveryLatitude: ACHETEUR.latitude,
      deliveryLongitude: ACHETEUR.longitude,
    } as Parameters<CheckoutService['create']>[1])

    expect(result.orders).toHaveLength(1)

    // The fee is the order's again. Read off it are the courier's pay, the
    // cash to collect and the refund — all of which read zero while it lived
    // on the wrapper.
    const [order] = await db.execute(
      `SELECT delivery_fee, checkout_id FROM orders WHERE checkout_id = ?`,
      [result.checkoutId],
    ) as Array<{ delivery_fee: string, checkout_id: string }>
    expect(Number(order.delivery_fee)).toBeGreaterThan(0)

    // No round: one shop is one delivery, taken the way isolated deliveries
    // have always been taken.
    const runs = await db.execute(
      `SELECT id FROM delivery_runs WHERE checkout_id = ?`,
      [result.checkoutId],
    ) as Array<{ id: string }>
    expect(runs).toHaveLength(0)

    // And the checkout still bills the fee, because that is what is paid.
    const [checkout] = await db.execute(
      `SELECT delivery_fee FROM checkouts WHERE id = ?`,
      [result.checkoutId],
    ) as Array<{ delivery_fee: string }>
    expect(Number(checkout.delivery_fee)).toBe(Number(order.delivery_fee))

    // The courier's pay hangs off this. The delivery snapshots the order's
    // fee when it is created, and the settlement pays from that snapshot —
    // so a fee left on the wrapper meant a courier credited nothing at all.
    const deliveries = app.get(DeliveriesService)
    const placed = await em.findOneOrFail(Order, { id: result.orders[0].orderId }, { populate: ['supplier', 'checkout'] })
    const created = await deliveries.createForOrder(placed)
    expect(created).not.toBeNull()

    const [course] = await db.execute(
      `SELECT delivery_fee, courier_fee, delivery_run_id FROM deliveries WHERE order_id = ?`,
      [placed.id],
    ) as Array<{ delivery_fee: string, courier_fee: string, delivery_run_id: string | null }>
    expect(Number(course.delivery_fee)).toBe(Number(order.delivery_fee))
    expect(Number(course.courier_fee)).toBeGreaterThan(0)
    expect(course.delivery_run_id).toBeNull()
  })

  it('refuse un panier qui mêle deux boutiques, en disant quoi faire', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seed(em)
    const checkouts = app.get(CheckoutService)

    const mixed = checkouts.create(fixture.buyerId, {
      items: [
        { productId: fixture.productId, quantity: 1 },
        { productId: fixture.otherProductId, quantity: 1 },
      ],
      pickupMode: 'DELIVERY',
      paymentMethod: 'CASH_ON_DELIVERY',
      deliveryAddress: 'Cadjehoun, près de la pharmacie',
      deliveryLatitude: ACHETEUR.latitude,
      deliveryLongitude: ACHETEUR.longitude,
    } as Parameters<CheckoutService['create']>[1])

    // Refused rather than priced on a rule that no longer exists: one fee for
    // two journeys was what the grouping was for, and the grouping is gone.
    await expect(mixed).rejects.toThrow(/une boutique à la fois/i)
  })
})
