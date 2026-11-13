import { EntityManager } from '@mikro-orm/postgresql'
import { beforeEach, describe, expect, it } from 'vitest'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { DeliveriesModule } from '../../deliveries/deliveries.module'
import { OrdersModule } from '../orders.module'
import { OrdersService } from '../orders.service'

/**
 * Order numbers come from a daily counter bumped atomically: callers racing
 * each other must never be handed the same number.
 */
describe('numéros de commande (e2e)', () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 6 }, { imports: [RolesModule, AuditModule, DeliveriesModule, OrdersModule] })
    context.app = app
    context.em = orm.em.fork()
  })

  it('donne des numéros distincts à des appels simultanés', async (context) => {
    const { app } = context as { app: { get: (token: unknown) => OrdersService } }
    const orders = app.get(OrdersService)

    const batches = await Promise.all([
      orders.allocateOrderNumbers(1),
      orders.allocateOrderNumbers(2),
      orders.allocateOrderNumbers(1),
      orders.allocateOrderNumbers(3),
    ])
    const numbers = batches.flat()

    expect(new Set(numbers).size).toBe(7)
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    expect(numbers.every(number => number.startsWith(`EB-${day}-`))).toBe(true)
    // A batch is a run of consecutive numbers.
    const seqs = batches[1].map(number => Number(number.slice(-3)))
    expect(seqs[1] - seqs[0]).toBe(1)
  })

  it('recrée le compteur du jour et continue à la suite', async (context) => {
    const { app, em } = context as { app: { get: (token: unknown) => OrdersService }, em: EntityManager }
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    // As on the first order of the day: no counter row yet.
    await em.getConnection().execute(`DELETE FROM order_number_counters WHERE day = ?`, [day])
    const orders = app.get(OrdersService)
    const [first] = await orders.allocateOrderNumbers(1)
    const [second] = await orders.allocateOrderNumbers(1)
    expect(Number(second.slice(-3))).toBe(Number(first.slice(-3)) + 1)
  })
})
