import type { INestApplication } from '@nestjs/common'
import { EntityManager } from '@mikro-orm/postgresql'
import { beforeEach, describe, expect, it } from 'vitest'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { ExportCountry } from '../contracts/terroir.contract'
import { ExportShipmentsService } from '../export-shipments.service'
import { TerroirCheckoutService } from '../terroir-checkout.service'
import { TerroirMapper } from '../terroir.mapper'
import { TerroirModule } from '../terroir.module'
import { seedTerroirWorld, terroirCart } from './terroir-checkout.fixture'
import { refusalOf } from './terroir.fixture'

const MONEY_KEY = /price|amount|total|fee|value|cost|insur|supplement|balance|fx|rate|paid/i

/** Every key of a JSON value, however deep. */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(keysOf)
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)])
  }
  return []
}

/** T052 (US10): a gifted parcel's public page shows the journey, never a price. */
describe('terroir — suivi public d\'un colis offert (e2e)', { timeout: 30_000 }, () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 6 }, {
      imports: [RolesModule, AuditModule, TerroirModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('la réponse publique ne contient aucune clé de prix ni de montant', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const world = await seedTerroirWorld(app, em, { balance: 200_000 })
    const created = await app.get(TerroirCheckoutService).create(world.buyerId, terroirCart(
      [{ productId: world.shopA.productIds[0], quantity: 2 }],
      {
        country: ExportCountry.BE,
        departureId: world.departureId,
        insured: true,
        gift: { name: 'Mireille', email: 'mireille@example.be', phone: '+32470123456', message: 'Joyeux anniversaire, un peu du pays' },
      },
    ))
    em.clear()
    app.get(EntityManager).clear()

    const tracking = TerroirMapper.toTracking(await app.get(ExportShipmentsService).byToken(created.shipment.trackingToken))
    const json = JSON.parse(JSON.stringify(tracking)) as unknown

    expect(keysOf(json).filter(key => MONEY_KEY.test(key))).toEqual([])
    expect(tracking.recipientName).toBe('Mireille')
    expect(tracking.giftMessage).toBe('Joyeux anniversaire, un peu du pays')
    expect(tracking.senderName).toBe('Awa D.')
    expect(tracking.pickupPoint?.city).toBe('Bruxelles')
    expect(tracking.lines).toEqual([expect.objectContaining({ quantity: 2 })])
    expect(tracking.events.map(event => event.step)).toEqual(['PAID'])
  })

  it('un colis pas encore payé ou un jeton inconnu répond 404', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const world = await seedTerroirWorld(app, em)
    const pending = await app.get(TerroirCheckoutService).create(world.buyerId, terroirCart(
      [{ productId: world.shopA.productIds[0], quantity: 1 }],
      { departureId: world.departureId, paymentMethod: 'FEDAPAY', gift: { name: 'Mireille', email: 'mireille@example.fr' } },
    ))
    const shipments = app.get(ExportShipmentsService)

    expect(await refusalOf(shipments.byToken(pending.shipment.trackingToken))).toEqual({ status: 404, code: 'EXPORT_SHIPMENT_NOT_FOUND' })
    expect(await refusalOf(shipments.byToken('0'.repeat(32)))).toEqual({ status: 404, code: 'EXPORT_SHIPMENT_NOT_FOUND' })
  })
})
