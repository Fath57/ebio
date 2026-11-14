import type { EntityManager } from '@mikro-orm/postgresql'
import type { INestApplication } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SmsService } from '../../../common/sms.service'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { DeliveriesModule } from '../../deliveries/deliveries.module'
import { DeliveriesService } from '../../deliveries/deliveries.service'
import { RECIPIENT_PHONE, seedDeliveryInTransit } from './gift-fixtures'

async function balanceOf(em: EntityManager, column: 'user_id' | 'courier_profile_id', id: string): Promise<number> {
  const rows = await em.getConnection().execute(
    `SELECT balance FROM wallets WHERE ${column} = ?`,
    [id],
  ) as Array<{ balance: string }>
  return rows.length === 0 ? 0 : Number(rows[0].balance)
}

/**
 * A cart for a relative that could not be handed over (research §5): the
 * courier is paid for the trip, the order cancelled, and the payer's wallet
 * credited with the order minus its delivery fee, once.
 */
describe('échec de remise à un proche (e2e)', () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 4 }, {
      imports: [RolesModule, AuditModule, DeliveriesModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('recrédite le payeur du total moins la livraison, une seule fois, et paie le livreur', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const sms = vi.spyOn(app.get(SmsService), 'send').mockResolvedValue(undefined)
    const deliveries = app.get(DeliveriesService)
    const fixture = await seedDeliveryInTransit(em, { orderTotal: 10000, deliveryFee: 1500, courierFee: 1200 })

    await deliveries.fail(fixture.deliveryIds[0], fixture.courierUserId, { reason: 'CUSTOMER_ABSENT' })

    expect(await balanceOf(em, 'user_id', fixture.buyerId)).toBe(8500)
    expect(await balanceOf(em, 'courier_profile_id', fixture.courierId)).toBe(1200)

    const [order] = await em.getConnection().execute(
      `SELECT o.status, d.status AS delivery_status FROM orders o JOIN deliveries d ON d.order_id = o.id WHERE o.id = ?`,
      [fixture.orderIds[0]],
    ) as Array<{ status: string, delivery_status: string }>
    expect(order.status).toBe('CANCELLED')
    // The failure stays on record: the cancellation does not overwrite it.
    expect(order.delivery_status).toBe('FAILED')

    // The relative had been told a cart was coming: they are told it is not.
    expect(sms).toHaveBeenCalledWith(RECIPIENT_PHONE, 'Le panier envoyé par Awa est annulé.')

    // Replayed: refused, and no money moves a second time.
    await expect(deliveries.fail(fixture.deliveryIds[0], fixture.courierUserId, { reason: 'CUSTOMER_ABSENT' })).rejects.toThrow()
    expect(await balanceOf(em, 'user_id', fixture.buyerId)).toBe(8500)
    expect(await balanceOf(em, 'courier_profile_id', fixture.courierId)).toBe(1200)

    const refunds = await em.getConnection().execute(
      `SELECT amount FROM wallet_transactions WHERE order_id = ? AND type = 'REFUND'`,
      [fixture.orderIds[0]],
    ) as Array<{ amount: string }>
    expect(refunds).toHaveLength(1)
    expect(sms.mock.calls.filter(([, message]) => message.includes('annulé'))).toHaveLength(1)
  })

  it('ne bouge pas d\'argent pour une commande ordinaire en échec', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const deliveries = app.get(DeliveriesService)
    const fixture = await seedDeliveryInTransit(em, { gift: false })

    await deliveries.fail(fixture.deliveryIds[0], fixture.courierUserId, { reason: 'CUSTOMER_ABSENT' })

    expect(await balanceOf(em, 'user_id', fixture.buyerId)).toBe(0)
    expect(await balanceOf(em, 'courier_profile_id', fixture.courierId)).toBe(0)
    const [order] = await em.getConnection().execute(
      `SELECT status FROM orders WHERE id = ?`,
      [fixture.orderIds[0]],
    ) as Array<{ status: string }>
    expect(order.status).toBe('IN_DELIVERY')
  })
})
