import type { INestApplication } from '@nestjs/common'
import { EntityManager } from '@mikro-orm/postgresql'
import { beforeEach, describe, expect, it } from 'vitest'
import { createUserData } from '../../../factories/user.factory'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { DeliveriesModule } from '../../deliveries/deliveries.module'
import { muteOutbound, refusalOf, seedShop } from '../../terroir/tests/terroir.fixture'
import { OrderStatus } from '../entities/order.entity'
import { OrdersModule } from '../orders.module'
import { OrdersService } from '../orders.service'

/** A placed terroir order, accepted by the shop. */
async function seedExportOrder(em: EntityManager): Promise<{ orderId: string, supplierId: string, buyerId: string }> {
  const shop = await seedShop(em)
  const buyer = await createUserData(em, { name: 'Awa Diaspora' })
  const [order] = await em.getConnection().execute(
    `INSERT INTO orders (order_number, buyer_id, supplier_id, pickup_mode, payment_method, status,
                         total_amount, delivery_fee, "createdAt", "updatedAt")
     VALUES (?, ?, ?, 'EXPORT', 'WALLET', 'ACCEPTED', 3000, 0, NOW(), NOW())
     RETURNING id`,
    [`EB-EXP-${Math.random().toString(36).slice(2, 8)}`, buyer.id, shop.supplierId],
  ) as Array<{ id: string }>
  return { orderId: order.id, supplierId: shop.supplierId, buyerId: buyer.id }
}

async function deliveriesOf(em: EntityManager, orderId: string): Promise<number> {
  const [row] = await em.getConnection().execute(`SELECT count(*)::int AS n FROM deliveries WHERE order_id = ?`, [orderId]) as Array<{ n: number }>
  return row.n
}

/**
 * Every local-delivery hook keys on `pickupMode === DELIVERY`: a terroir order
 * (`EXPORT`) must never reach the courier dispatch, and its buyer follows the
 * parcel rather than confirming a delivery.
 */
describe('commande terroir : jamais de livreur local (e2e)', () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 4 }, {
      imports: [RolesModule, AuditModule, DeliveriesModule, OrdersModule],
    })
    muteOutbound(app)
    context.app = app
    context.em = orm.em.fork()
  })

  it('passe en préparation puis « prête pour la collecte » sans créer de livraison', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const { orderId, supplierId } = await seedExportOrder(em)
    const orders = app.get(OrdersService)

    await orders.updateStatus(orderId, supplierId, OrderStatus.PREPARING, 30)
    await orders.updateStatus(orderId, supplierId, OrderStatus.READY)

    expect(await deliveriesOf(em, orderId)).toBe(0)
  })

  it('refuse à la boutique « en livraison » et à l\'acheteur la confirmation de livraison', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const { orderId, supplierId, buyerId } = await seedExportOrder(em)
    const orders = app.get(OrdersService)
    await orders.updateStatus(orderId, supplierId, OrderStatus.PREPARING, 30)
    await orders.updateStatus(orderId, supplierId, OrderStatus.READY)

    expect((await refusalOf(orders.updateStatus(orderId, supplierId, OrderStatus.IN_DELIVERY))).code).toBe('EXPORT_ORDER')
    expect((await refusalOf(orders.confirmDelivery(orderId, buyerId))).code).toBe('EXPORT_ORDER')
    expect(await deliveriesOf(em, orderId)).toBe(0)
  })
})
