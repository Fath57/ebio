import type { EntityManager } from '@mikro-orm/postgresql'
import type { INestApplication } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SmsService } from '../../../common/sms.service'
import { createUserData } from '../../../factories/user.factory'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { DeliveriesMapper } from '../../deliveries/deliveries.mapper'
import { DeliveriesModule } from '../../deliveries/deliveries.module'
import { DeliveriesService } from '../../deliveries/deliveries.service'
import { GiftNotifierService } from '../../gift/gift-notifier.service'
import { CheckoutService } from '../checkout.service'
import { createCheckoutSchema } from '../contracts/checkout.contract'
import { Order } from '../entities/order.entity'
import { OrdersModule } from '../orders.module'

/** Cotonou: one shop, the relative's door a couple of kilometres away. */
const BOUTIQUE = { latitude: 6.3616, longitude: 2.4264 }
const PROCHE = { latitude: 6.3700, longitude: 2.4300 }
const PAYER_PHONE = '+33612345678'
const RECIPIENT = { name: 'Afiavi Kossou', phone: '+2290197000001' }

interface Fixture {
  buyerId: string
  productId: string
}

async function seed(em: EntityManager, payerPhone = PAYER_PHONE): Promise<Fixture> {
  const buyer = await createUserData(em, { name: 'Awa Diallo', phone: payerPhone })
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

function giftCart(fixture: Fixture, overrides: Record<string, unknown> = {}): Parameters<CheckoutService['create']>[1] {
  return {
    items: [{ productId: fixture.productId, quantity: 2 }],
    pickupMode: 'DELIVERY',
    paymentMethod: 'FEDAPAY',
    deliveryAddress: 'Cadjèhoun, portail bleu après la pharmacie',
    deliveryLatitude: PROCHE.latitude,
    deliveryLongitude: PROCHE.longitude,
    recipient: RECIPIENT,
    displayCurrency: 'XOF',
    payerTimeZone: 'Europe/Paris',
    ...overrides,
  } as Parameters<CheckoutService['create']>[1]
}

/** The `code` of a refusal. */
async function refusalCode(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  }
  catch (error) {
    const response = (error as { getResponse?: () => unknown }).getResponse?.()
    return (response as { code?: unknown } | undefined)?.code
  }
  throw new Error('Le passage en caisse aurait dû être refusé')
}

describe('commander pour un proche (e2e)', () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 4 }, {
      imports: [RolesModule, AuditModule, DeliveriesModule, OrdersModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('refuse les espèces et le retrait sur place', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seed(em)
    const checkouts = app.get(CheckoutService)

    expect(await refusalCode(checkouts.create(fixture.buyerId, giftCart(fixture, { paymentMethod: 'CASH_ON_DELIVERY' }))))
      .toBe('GIFT_CASH_NOT_ALLOWED')
    expect(await refusalCode(checkouts.create(fixture.buyerId, giftCart(fixture, { pickupMode: 'ON_SITE' }))))
      .toBe('GIFT_REQUIRES_DELIVERY')
  })

  it('refuse un numéro de proche hors du Bénin', () => {
    const parsed = createCheckoutSchema.safeParse({
      items: [{ productId: '7f1c1a4e-8b4b-4c55-9a52-1f8d2b8f5a10', quantity: 1 }],
      pickupMode: 'DELIVERY',
      paymentMethod: 'FEDAPAY',
      recipient: { name: 'Afiavi', phone: '+33612345678' },
    })
    expect(parsed.success).toBe(false)

    const unknownZone = createCheckoutSchema.safeParse({
      items: [{ productId: '7f1c1a4e-8b4b-4c55-9a52-1f8d2b8f5a10', quantity: 1 }],
      pickupMode: 'DELIVERY',
      paymentMethod: 'FEDAPAY',
      payerTimeZone: 'Mars/Olympus',
    })
    expect(unknownZone.success).toBe(false)
  })

  it('traite le numéro du payeur comme une commande ordinaire', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    // A payer with a Beninese number who types their own number as the
    // relative's: an ordinary order, cash is then allowed again.
    const fixture = await seed(em, '+2290197555555')
    const own = await app.get(CheckoutService).create(
      fixture.buyerId,
      giftCart(fixture, { recipient: { name: 'Moi-même', phone: '+2290197555555' }, paymentMethod: 'CASH_ON_DELIVERY' }),
    )
    expect(own.isGift).toBe(false)
    const [row] = await em.getConnection().execute(
      `SELECT recipient_phone, tracking_token FROM checkouts WHERE id = ?`,
      [own.checkoutId],
    ) as Array<{ recipient_phone: string | null, tracking_token: string | null }>
    expect(row.recipient_phone).toBeNull()
    expect(row.tracking_token).toBeNull()
  })

  it('crée un jeton de suivi unique et fige le proche', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seed(em)
    const checkouts = app.get(CheckoutService)

    const first = await checkouts.create(fixture.buyerId, giftCart(fixture))
    // Another basket: the same one twice in two minutes is refused as a double tap.
    const second = await checkouts.create(fixture.buyerId, giftCart(fixture, { items: [{ productId: fixture.productId, quantity: 3 }] }))
    expect(first.isGift).toBe(true)
    expect(first.display).toBeNull()

    const rows = await em.getConnection().execute(
      `SELECT recipient_name, recipient_phone, tracking_token, payer_time_zone, display_currency, fx_rate
       FROM checkouts WHERE id IN (?, ?)`,
      [first.checkoutId, second.checkoutId],
    ) as Array<Record<string, string | null>>
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.recipient_name).toBe(RECIPIENT.name)
      expect(row.recipient_phone).toBe(RECIPIENT.phone)
      expect(row.tracking_token).toMatch(/^[\w-]{24}$/)
      expect(row.payer_time_zone).toBe('Europe/Paris')
      expect(row.display_currency).toBe('XOF')
      expect(row.fx_rate).toBeNull()
    }
    expect(rows[0].tracking_token).not.toBe(rows[1].tracking_token)
  })

  it('annonce le panier au proche dès qu\'il est payé, une seule fois', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const sms = vi.spyOn(app.get(SmsService), 'send').mockResolvedValue(undefined)
    const fixture = await seed(em)
    await em.getConnection().execute(
      `INSERT INTO wallets (user_id, balance, "createdAt", "updatedAt") VALUES (?, 50000, NOW(), NOW())`,
      [fixture.buyerId],
    )

    const result = await app.get(CheckoutService).create(fixture.buyerId, giftCart(fixture, { paymentMethod: 'WALLET' }))
    const [checkout] = await em.getConnection().execute(
      `SELECT tracking_token, recipient_announced_at FROM checkouts WHERE id = ?`,
      [result.checkoutId],
    ) as Array<{ tracking_token: string, recipient_announced_at: Date | null }>

    expect(checkout.recipient_announced_at).not.toBeNull()
    expect(sms).toHaveBeenCalledTimes(1)
    const [phone, message] = sms.mock.calls[0]
    expect(phone).toBe(RECIPIENT.phone)
    expect(message).toMatch(/^Awa vous envoie un panier eBio/)
    expect(message).toContain(`/suivi/${checkout.tracking_token}`)
    expect(message).not.toMatch(/code/i)

    // A replayed confirmation (the app, then the reconciliation) says nothing more.
    await app.get(GiftNotifierService).announceToRecipient(result.checkoutId)
    expect(sms).toHaveBeenCalledTimes(1)
  })

  it('donne au livreur le proche comme contact', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seed(em)
    const result = await app.get(CheckoutService).create(fixture.buyerId, giftCart(fixture))

    const deliveries = app.get(DeliveriesService)
    const order = await em.findOneOrFail(Order, { id: result.orders[0].orderId }, { populate: ['supplier', 'checkout'] })
    const delivery = await deliveries.createForOrder(order)
    expect(delivery).not.toBeNull()

    const courierUser = await createUserData(em)
    const [courier] = await em.getConnection().execute(
      `INSERT INTO courier_profiles (user_id, full_name, phone, vehicle_type, zone, validation_status, is_available, "createdAt", "updatedAt")
       VALUES (?, 'Jean Livreur', '+22990000123', 'MOTO', 'Cotonou', 'VALIDATED', true, NOW(), NOW()) RETURNING id`,
      [courierUser.id],
    ) as Array<{ id: string }>
    await em.getConnection().execute(
      `UPDATE deliveries SET courier_id = ?, status = 'ACCEPTED', accepted_at = NOW() WHERE id = ?`,
      [courier.id, delivery!.id],
    )
    em.clear()

    const seen = await deliveries.getForRequester(delivery!.id, courierUser.id)
    expect(seen.audience).toBe('courier')
    const response = DeliveriesMapper.toResponse(seen.delivery, seen.audience, [])
    expect(response.requiresGiftProof).toBe(true)
    expect(response.buyerContact).toEqual({
      name: RECIPIENT.name,
      phone: RECIPIENT.phone,
      role: 'RECIPIENT',
      payerFirstName: 'Awa',
    })
  })
})
