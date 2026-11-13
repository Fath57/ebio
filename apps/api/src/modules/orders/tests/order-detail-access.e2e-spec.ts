import type { INestApplication } from '@nestjs/common'
import { EntityManager } from '@mikro-orm/postgresql'
import { NotFoundException } from '@nestjs/common'
import { beforeEach, describe, expect, it } from 'vitest'
import { createUserData } from '../../../factories/user.factory'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { DeliveriesModule } from '../../deliveries/deliveries.module'
import { RECIPIENT_PHONE, seedDeliveryInTransit } from '../../gift/tests/gift-fixtures'
import { RatingsModule } from '../../ratings/ratings.module'
import { OrdersController } from '../orders.controller'

type Session = Parameters<OrdersController['findById']>[0]

function sessionOf(userId: string, role = 'BUYER'): Session {
  return { user: { id: userId, role } } as Session
}

/** As a fresh request would: nothing remembered from the previous one. */
async function detail(app: INestApplication, orderId: string, session: Session) {
  app.get(EntityManager).clear()
  return app.get(OrdersController).findById(session, orderId)
}

/**
 * `read Order` is granted to every buyer without a condition on the row, so
 * the order detail checks ownership itself: its buyer, its shop and the
 * back-office read it; anyone else is told it does not exist.
 */
describe('détail d\'une commande : qui peut le lire (e2e)', () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 4 }, {
      imports: [RolesModule, AuditModule, DeliveriesModule, RatingsModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('ouvre la commande à son acheteur, à sa boutique et au back-office', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seedDeliveryInTransit(em)
    const orderId = fixture.orderIds[0]
    const [{ supplier_user_id: supplierUserId }] = await em.getConnection().execute<{ supplier_user_id: string }[]>(
      `SELECT s.user_id AS supplier_user_id FROM orders o JOIN suppliers s ON s.id = o.supplier_id WHERE o.id = ?`,
      [orderId],
    )
    const admin = await createUserData(em, { name: 'Admin eBio' })

    expect((await detail(app, orderId, sessionOf(fixture.buyerId))).id).toBe(orderId)
    expect((await detail(app, orderId, sessionOf(supplierUserId, 'SUPPLIER'))).id).toBe(orderId)
    expect((await detail(app, orderId, sessionOf(admin.id, 'ADMIN'))).id).toBe(orderId)
  })

  it('répond « introuvable » à un autre acheteur, et au proche qui a ses propres routes', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seedDeliveryInTransit(em)
    const orderId = fixture.orderIds[0]
    const stranger = await createUserData(em, { name: 'Un autre acheteur' })
    const relative = await createUserData(em, { name: 'Afiavi Kossou', phone: RECIPIENT_PHONE, phoneVerifiedAt: new Date() })

    await expect(detail(app, orderId, sessionOf(stranger.id))).rejects.toBeInstanceOf(NotFoundException)
    // The relative reads « Paniers reçus », which carries no amount.
    await expect(detail(app, orderId, sessionOf(relative.id))).rejects.toBeInstanceOf(NotFoundException)
  })
})
