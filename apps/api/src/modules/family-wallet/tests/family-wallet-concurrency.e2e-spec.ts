import type { INestApplication } from '@nestjs/common'
import type { CreateCheckoutResponse } from '../../orders/contracts/checkout.contract'
import { RequestContext } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { beforeEach, describe, expect, it } from 'vitest'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { DeliveriesModule } from '../../deliveries/deliveries.module'
import { CheckoutService } from '../../orders/checkout.service'
import { OrdersModule } from '../../orders/orders.module'
import { spentThisMonth } from '../family-payment.service'
import { FamilyWalletModule } from '../family-wallet.module'
import { balanceOf, familyCart, seedFamily } from './family-checkout.fixture'

/**
 * Each payment in its own request context, hence its own transaction and
 * connection, started together: the wallet lock alone decides.
 */
async function together(app: INestApplication, payments: Array<() => Promise<CreateCheckoutResponse>>): Promise<PromiseSettledResult<CreateCheckoutResponse>[]> {
  const em = app.get(EntityManager)
  return Promise.allSettled(payments.map(pay => RequestContext.create(em, pay)))
}

function reasonOf(result: PromiseSettledResult<unknown>): unknown {
  if (result.status !== 'rejected') {
    return null
  }
  const body = (result.reason as { getResponse?: () => unknown }).getResponse?.() as Record<string, unknown> | undefined
  return body?.reason
}

/** SC-004: simultaneous payments never spend the same money, nor the same month, twice. */
describe('portefeuille famille, paiements simultanés (e2e)', { timeout: 30_000 }, () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 8 }, {
      imports: [RolesModule, AuditModule, DeliveriesModule, OrdersModule, FamilyWalletModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('deux membres paient 3 000 en même temps sur 5 000 : un seul passe', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seedFamily(app, em, { balance: 5_000, price: 1_500 })
    const checkouts = app.get(CheckoutService)

    const results = await together(app, [
      () => checkouts.create(fixture.maman.userId, familyCart(fixture.productIds[0], fixture.maman.memberId, 2)),
      () => checkouts.create(fixture.tata.userId, familyCart(fixture.productIds[1], fixture.tata.memberId, 2)),
    ])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.filter(result => result.status === 'rejected')
    expect(rejected).toHaveLength(1)
    expect(reasonOf(rejected[0])).toBe('INSUFFICIENT')
    expect(await balanceOf(em, fixture.balanceWalletId)).toBe(2_000)

    const [{ count }] = await em.getConnection().execute(
      `SELECT COUNT(*)::int AS count FROM wallet_transactions WHERE wallet_id = ? AND type = 'ORDER_PAYMENT'`,
      [fixture.balanceWalletId],
    ) as Array<{ count: number }>
    expect(count).toBe(1)
  })

  it('un même membre, deux commandes simultanées sous un plafond de 4 000 : une seule passe', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seedFamily(app, em, { balance: 20_000, price: 1_500 })
    await em.getConnection().execute(`UPDATE family_wallet_members SET monthly_cap = 4000 WHERE id = ?`, [fixture.maman.memberId])
    const checkouts = app.get(CheckoutService)

    // Two different carts: the same one twice would be refused as a double tap.
    const results = await together(app, [
      () => checkouts.create(fixture.maman.userId, familyCart(fixture.productIds[0], fixture.maman.memberId, 2)),
      () => checkouts.create(fixture.maman.userId, familyCart(fixture.productIds[1], fixture.maman.memberId, 2)),
    ])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.filter(result => result.status === 'rejected')
    expect(reasonOf(rejected[0])).toBe('MONTHLY_CAP')
    expect(await balanceOf(em, fixture.balanceWalletId)).toBe(17_000)
    expect(await spentThisMonth(em, fixture.maman.memberId, new Date())).toBe(3_000)
  })
})
