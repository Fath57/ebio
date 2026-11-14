import type { INestApplication } from '@nestjs/common'
import type { TerroirCheckoutCreated } from '../terroir-checkout.service'
import { RequestContext } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { beforeEach, describe, expect, it } from 'vitest'
import { createUserData } from '../../../factories/user.factory'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { ExportShipmentStatus } from '../contracts/terroir.contract'
import { ExportShipment } from '../entities/export-shipment.entity'
import { TerroirCheckoutService } from '../terroir-checkout.service'
import { TerroirModule } from '../terroir.module'
import { balanceOfUser, seedTerroirWorld, terroirCart, topUp } from './terroir-checkout.fixture'
import { refusalOf } from './terroir.fixture'

/** Each payment in its own request context — its own transaction and connection — started together. */
async function together(app: INestApplication, payments: Array<() => Promise<TerroirCheckoutCreated>>): Promise<PromiseSettledResult<TerroirCheckoutCreated>[]> {
  const em = app.get(EntityManager)
  return Promise.allSettled(payments.map(pay => RequestContext.create(em, pay)))
}

function codeOf(result: PromiseSettledResult<unknown>): unknown {
  if (result.status !== 'rejected') {
    return null
  }
  const body = (result.reason as { getResponse?: () => unknown }).getResponse?.() as Record<string, unknown> | undefined
  return body?.code
}

/** T030: the departure lock alone decides when two parcels would overfill it. */
describe('terroir — capacité d\'un départ sous paiements simultanés (e2e)', { timeout: 40_000 }, () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 8 }, {
      imports: [RolesModule, AuditModule, TerroirModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('deux colis de 5,8 kg payés en même temps sur un départ de 10 kg : un seul passe', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const world = await seedTerroirWorld(app, em, { balance: 200_000, capacityKg: 10 })
    const other = await createUserData(em, { name: 'Koffi Mensah' })
    await topUp(app, other.id, 200_000)
    const service = app.get(TerroirCheckoutService)

    // 11 × 500 g + 300 g of packaging = 5,8 kg each.
    const results = await together(app, [
      () => service.create(world.buyerId, terroirCart([{ productId: world.shopA.productIds[2], quantity: 11 }], { departureId: world.departureId })),
      () => service.create(other.id, terroirCart([{ productId: world.shopB.productIds[2], quantity: 11 }], { departureId: world.departureId })),
    ])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.filter(result => result.status === 'rejected')
    expect(rejected).toHaveLength(1)
    expect(codeOf(rejected[0])).toBe('DEPARTURE_UNAVAILABLE')
    em.clear()
    expect(await em.count(ExportShipment, { departure: world.departureId })).toBe(1)
    // The refused buyer kept their money.
    const balances = [await balanceOfUser(em, world.buyerId), await balanceOfUser(em, other.id)].sort()
    expect(balances[1]).toBe(200_000)
  })

  it('un paiement par carte en attente retient ses kilos : un autre colis qui ne tient plus est refusé', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const world = await seedTerroirWorld(app, em, { balance: 200_000, capacityKg: 10 })
    const other = await createUserData(em, { name: 'Koffi Mensah' })
    const service = app.get(TerroirCheckoutService)

    const pending = await service.create(other.id, terroirCart([{ productId: world.shopB.productIds[2], quantity: 11 }], { departureId: world.departureId, paymentMethod: 'FEDAPAY' }))
    expect(pending.shipment.status).toBe(ExportShipmentStatus.PENDING_PAYMENT)

    expect(await refusalOf(service.create(world.buyerId, terroirCart([{ productId: world.shopA.productIds[2], quantity: 11 }], { departureId: world.departureId }))))
      .toEqual({ status: 409, code: 'DEPARTURE_UNAVAILABLE' })
  })
})
