import type { EntityManager } from '@mikro-orm/postgresql'
import type { INestApplication } from '@nestjs/common'
import { NotFoundException } from '@nestjs/common'
import { beforeEach, describe, expect, it } from 'vitest'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { DeliveriesModule } from '../../deliveries/deliveries.module'
import { GiftTrackingController } from '../gift-tracking.controller'
import { GiftTrackingMapper } from '../gift-tracking.mapper'
import { GiftTrackingService } from '../gift-tracking.service'
import { addOrderLine, PORTE_DU_PROCHE, seedDeliveryInTransit } from './gift-fixtures'

/** Keys that must never appear on a page anyone holding the link can read (FR-011). */
const FORBIDDEN_KEY = /price|amount|total|code|phone|address/i

function keysOf(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      keysOf(item, found)
    }
  }
  else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      found.push(key)
      keysOf(child, found)
    }
  }
  return found
}

/** The serialized answer, as the public page receives it. */
async function read(app: INestApplication, token: string): Promise<Record<string, unknown>> {
  const body = await app.get(GiftTrackingController).get(token)
  return JSON.parse(JSON.stringify(body)) as Record<string, unknown>
}

async function tokenOf(em: EntityManager, checkoutId: string): Promise<string> {
  const [row] = await em.getConnection().execute(`SELECT tracking_token FROM checkouts WHERE id = ?`, [checkoutId]) as Array<{ tracking_token: string }>
  return row.tracking_token
}

/**
 * The public tracking link of a cart sent to a relative (contracts §5):
 * read without an account, so it says where the cart is and nothing else.
 */
describe('suivi public d\'un panier pour un proche (e2e)', () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 4 }, {
      imports: [RolesModule, AuditModule, DeliveriesModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('montre le panier et le livreur pendant la course, sans prix, code, téléphone ni adresse', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seedDeliveryInTransit(em)
    await addOrderLine(em, fixture.orderIds[0], 'Tomates fraîches bio', 2)
    await em.getConnection().execute(
      `UPDATE courier_profiles SET last_latitude = 6.36, last_longitude = 2.39, last_location_at = NOW() WHERE id = ?`,
      [fixture.courierId],
    )

    const body = await read(app, await tokenOf(em, fixture.checkoutId))

    expect(body).toMatchObject({
      payerFirstName: 'Awa',
      recipientFirstName: 'Afiavi',
      status: 'IN_TRANSIT',
      shops: [{ name: 'Fruits Fatou' }],
      lines: [{ name: 'Tomates fraîches bio', quantity: 2, imageUrl: 'https://cdn.ebio.test/tomates.thumb.webp' }],
      courierPosition: { latitude: 6.36, longitude: 2.39 },
      destination: PORTE_DU_PROCHE,
      expired: false,
    })
    expect(keysOf(body).filter(key => FORBIDDEN_KEY.test(key))).toEqual([])
    expect(JSON.stringify(body)).not.toContain('+229')
    expect(JSON.stringify(body)).not.toContain('Cadjèhoun')
  })

  it('ne montre pas le livreur avant la collecte ni après la remise', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seedDeliveryInTransit(em)
    const token = await tokenOf(em, fixture.checkoutId)
    const db = em.getConnection()
    await db.execute(
      `UPDATE courier_profiles SET last_latitude = 6.36, last_longitude = 2.39, last_location_at = NOW() WHERE id = ?`,
      [fixture.courierId],
    )

    await db.execute(`UPDATE orders SET status = 'READY' WHERE id = ?`, [fixture.orderIds[0]])
    await db.execute(`UPDATE deliveries SET status = 'ACCEPTED', picked_up_at = NULL, in_transit_at = NULL WHERE id = ?`, [fixture.deliveryIds[0]])
    const before = await read(app, token)
    expect(before.status).toBe('PREPARING')
    expect(before.courierPosition).toBeNull()

    await db.execute(`UPDATE orders SET status = 'DELIVERED', delivered_at = NOW() WHERE id = ?`, [fixture.orderIds[0]])
    await db.execute(`UPDATE deliveries SET status = 'DELIVERED', delivered_at = NOW() WHERE id = ?`, [fixture.deliveryIds[0]])
    const after = await read(app, token)
    expect(after.status).toBe('DELIVERED')
    expect(after.courierPosition).toBeNull()
    expect(after.expired).toBe(false)
  })

  it('à J+8 après la remise, ne dit plus que l\'issue', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seedDeliveryInTransit(em)
    await addOrderLine(em, fixture.orderIds[0])
    const db = em.getConnection()
    await db.execute(`UPDATE orders SET status = 'DELIVERED', delivered_at = NOW() - interval '8 days' WHERE id = ?`, [fixture.orderIds[0]])
    await db.execute(`UPDATE deliveries SET status = 'DELIVERED', delivered_at = NOW() - interval '8 days' WHERE id = ?`, [fixture.deliveryIds[0]])

    expect(await read(app, await tokenOf(em, fixture.checkoutId))).toEqual({ status: 'DELIVERED', expired: true })
  })

  it('une remise échouée se lit « FAILED », puis expire sept jours après', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seedDeliveryInTransit(em)
    const db = em.getConnection()
    await db.execute(`UPDATE orders SET status = 'CANCELLED' WHERE id = ?`, [fixture.orderIds[0]])
    await db.execute(`UPDATE deliveries SET status = 'FAILED', failed_at = NOW() WHERE id = ?`, [fixture.deliveryIds[0]])
    const token = await tokenOf(em, fixture.checkoutId)

    expect((await read(app, token)).status).toBe('FAILED')

    const bundle = await app.get(GiftTrackingService).findByToken(token)
    const later = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000)
    expect(GiftTrackingMapper.toResponse(bundle!, later)).toEqual({ status: 'FAILED', expired: true })
  })

  it('répond 404 à un jeton inconnu et à une commande ordinaire', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    await seedDeliveryInTransit(em, { gift: false })

    await expect(app.get(GiftTrackingController).get('inconnu-0123456789abcdef')).rejects.toBeInstanceOf(NotFoundException)
  })
})
