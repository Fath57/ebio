import type { INestApplication } from '@nestjs/common'
import type { ExportDepartureRateInput } from '../contracts/terroir.contract'
import type { TerroirWorld } from './terroir-checkout.fixture'
import { EntityManager } from '@mikro-orm/postgresql'
import { beforeEach, describe, expect, it } from 'vitest'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { Notification } from '../../notifications/notification.entity'
import { Checkout } from '../../payments/entities/checkout.entity'
import { PlatformSettingsService } from '../../settings/platform-settings.service'
import { AdminExportController } from '../admin-export.controller'
import { ExportShipmentStatus } from '../contracts/terroir.contract'
import { ExportShipment } from '../entities/export-shipment.entity'
import { ExportLogisticsService } from '../export-logistics.service'
import { ExportShipmentsService } from '../export-shipments.service'
import { TerroirCheckoutService } from '../terroir-checkout.service'
import { TerroirClientController } from '../terroir-client.controller'
import { TerroirModule } from '../terroir.module'
import { seedTerroirWorld, terroirCart } from './terroir-checkout.fixture'
import { refusalOf } from './terroir.fixture'

const CANADA = {
  code: 'CA',
  name: 'Canada',
  toPhrase: 'vers le Canada',
  inPhrase: 'au Canada',
  displayCurrency: 'CAD' as const,
  flagEmoji: '🇨🇦',
  sortOrder: 30,
}

/** The fixture's departure rates, plus Canada at 9 500 FCFA per kilo. */
const RATES: ExportDepartureRateInput[] = [
  { country: 'FR', pricePerKg: 8500, minBilledKg: 5, maxWeightKg: 30, homeDeliveryFee: 3900 },
  { country: 'BE', pricePerKg: 9000, minBilledKg: 5, homeDeliveryFee: null },
  { country: 'CA', pricePerKg: 9500, minBilledKg: 5, homeDeliveryFee: null },
]

function sessionOf(userId: string): never {
  return { user: { id: userId } } as never
}

function fresh(app: INestApplication, em: EntityManager): void {
  em.clear()
  app.get(EntityManager).clear()
}

/** Canada created by the back office, served by the fixture's departure, with a pickup point in Montréal. */
async function openCanada(app: INestApplication, world: TerroirWorld): Promise<string> {
  await app.get(AdminExportController).createCountry(CANADA, sessionOf(world.agentId))
  const logistics = app.get(ExportLogisticsService)
  const point = await logistics.createPickupPoint(world.agencyId, { country: 'CA', city: 'Montréal', address: '1200 rue Sainte-Catherine, Montréal' }, world.agentId)
  await logistics.updateDeparture(world.departureId, { rates: RATES }, world.agentId)
  return point.id
}

/**
 * Destination countries are data: the back office opens Canada without a
 * new app version, buyers only see it once a departure serves it, and
 * closing it stops new parcels without stranding those already paid.
 */
describe('terroir, pays de destination (e2e)', { timeout: 60_000 }, () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 6 }, {
      imports: [RolesModule, AuditModule, TerroirModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('le back-office ajoute le Canada : caché tant qu\'aucun départ ne le dessert, puis proposé', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const world = await seedTerroirWorld(app, em)
    const admin = app.get(AdminExportController)
    const client = app.get(TerroirClientController)

    const created = await admin.createCountry(CANADA, sessionOf(world.agentId))
    expect(created).toMatchObject({ ...CANADA, isActive: true, counts: { pickupPoints: 0, openDepartures: 0, activeShipments: 0 } })
    expect(await refusalOf(admin.createCountry(CANADA, sessionOf(world.agentId)))).toEqual({ status: 409, code: 'EXPORT_COUNTRY_EXISTS' })
    const [audit] = await em.getConnection().execute(`SELECT action FROM audit_logs WHERE target_type = 'export_country' AND target_id = 'CA'`) as Array<{ action: string }>
    expect(audit?.action).toBe('EXPORT_COUNTRY_CREATED')

    expect((await client.getCountries({ all: 'false' })).map(country => country.code)).toEqual(['FR', 'BE'])
    const all = await client.getCountries({ all: 'true' })
    expect(all.map(country => country.code)).toEqual(['FR', 'BE', 'CA'])
    expect(all.find(country => country.code === 'CA')).toEqual({ code: 'CA', name: 'Canada', toPhrase: 'vers le Canada', inPhrase: 'au Canada', displayCurrency: 'CAD', flagEmoji: '🇨🇦', hasOpenDeparture: false })

    // A pickup point and a rate towards an unknown country are refused.
    const logistics = app.get(ExportLogisticsService)
    expect(await refusalOf(logistics.createPickupPoint(world.agencyId, { country: 'ZZ', city: 'Nulle part', address: '1 rue de Nulle part' }, world.agentId))).toEqual({ status: 400, code: 'EXPORT_COUNTRY_UNKNOWN' })
    expect(await refusalOf(logistics.updateDeparture(world.departureId, { rates: [...RATES, { country: 'ZZ', pricePerKg: 1000, minBilledKg: 1 }] }, world.agentId))).toEqual({ status: 400, code: 'EXPORT_COUNTRY_UNKNOWN' })

    await logistics.createPickupPoint(world.agencyId, { country: 'CA', city: 'Montréal', address: '1200 rue Sainte-Catherine, Montréal' }, world.agentId)
    await logistics.updateDeparture(world.departureId, { rates: RATES }, world.agentId)
    fresh(app, em)

    const served = await client.getCountries({ all: 'false' })
    expect(served.map(country => country.code)).toEqual(['FR', 'BE', 'CA'])
    expect(served.every(country => country.hasOpenDeparture)).toBe(true)
    const listed = await admin.listCountries()
    expect(listed.find(country => country.code === 'CA')?.counts).toEqual({ pickupPoints: 1, openDepartures: 1, activeShipments: 0 })
    expect(await refusalOf(admin.updateCountry('ZZ', { name: 'Nulle part' }, sessionOf(world.agentId)))).toEqual({ status: 404, code: 'EXPORT_COUNTRY_UNKNOWN' })
  })

  it('valise vers le Canada affichée en dollars canadiens ; pays fermé : nouvelles valises refusées, colis en cours suivis, France intacte', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const world = await seedTerroirWorld(app, em, { balance: 200_000 })
    await app.get(PlatformSettingsService).setExchangeRates({ CAD: 450 }, 'MANUAL')
    const montreal = await openCanada(app, world)
    const admin = app.get(AdminExportController)
    const client = app.get(TerroirClientController)
    const checkout = app.get(TerroirCheckoutService)
    const cart = terroirCart([{ productId: world.shopA.productIds[0], quantity: 2 }], { country: 'CA', departureId: world.departureId, displayCurrency: undefined })

    // No currency asked: the country's own.
    const catalog = await client.getCatalog({ country: 'CA', page: 1 })
    expect(catalog).toMatchObject({ country: 'CA', currency: 'CAD' })
    expect(catalog.products.find(product => product.id === world.shopA.productIds[0])?.displayPrice).not.toBeNull()
    const quote = await checkout.preview(world.buyerId, cart)
    expect(quote.currency).toBe('CAD')
    expect(quote.rate).not.toBeNull()
    expect(quote.selected?.rate.pricePerKg).toBe(9500)
    expect(quote.pickupPoints.map(point => point.id)).toEqual([montreal])

    const created = await checkout.create(world.buyerId, cart)
    fresh(app, em)
    const paid = await em.findOneOrFail(Checkout, { id: created.checkout.id })
    expect(paid.displayCurrency).toBe('CAD')
    expect(paid.displayTotal).not.toBeNull()
    const shipment = await em.findOneOrFail(ExportShipment, { id: created.shipment.id }, { populate: ['pickupPoint'] })
    expect(shipment).toMatchObject({ country: 'CA', status: ExportShipmentStatus.PAID })
    expect(shipment.pickupPoint?.id).toBe(montreal)
    expect(Number(shipment.shippingPrice)).toBe(47_500)

    // Closed: nothing new towards Canada.
    const closed = await admin.updateCountry('ca', { isActive: false }, sessionOf(world.agentId))
    expect(closed).toMatchObject({ code: 'CA', isActive: false, counts: { pickupPoints: 1, openDepartures: 1, activeShipments: 1 } })
    const inactive = { status: 409, code: 'EXPORT_COUNTRY_INACTIVE' }
    expect(await refusalOf(client.getCatalog({ country: 'CA', page: 1 }))).toEqual(inactive)
    expect(await refusalOf(client.getDepartures(sessionOf(world.buyerId), { country: 'CA', weightG: 1000 }))).toEqual(inactive)
    expect(await refusalOf(checkout.preview(world.buyerId, cart))).toEqual(inactive)
    expect(await refusalOf(checkout.create(world.buyerId, cart))).toEqual(inactive)
    expect(await refusalOf(app.get(ExportLogisticsService).subscribeAlert(world.buyerId, 'CA'))).toEqual(inactive)
    expect((await client.getCountries({ all: 'true' })).map(country => country.code)).toEqual(['FR', 'BE'])

    // The parcel already paid travels on: the buyer follows it, eBio moves it.
    const shipments = app.get(ExportShipmentsService)
    expect((await client.getShipment(sessionOf(world.buyerId), shipment.id)).country).toBe('CA')
    expect((await admin.shipment(shipment.id)).country).toBe('CA')
    await shipments.addEvent(shipment.id, { step: ExportShipmentStatus.DEPARTED }, world.agentId)
    const arrived = await admin.shipmentEvent(shipment.id, { step: ExportShipmentStatus.ARRIVED }, sessionOf(world.agentId))
    expect(arrived.status).toBe(ExportShipmentStatus.ARRIVED)
    const bodies = (await em.find(Notification, { user: world.buyerId })).map(notification => notification.body)
    expect(bodies.some(body => body.includes('parti vers le Canada'))).toBe(true)
    expect(bodies.some(body => body.includes('arrivé au Canada'))).toBe(true)

    // France is untouched.
    const france = (await admin.listCountries()).find(country => country.code === 'FR')
    expect(france?.isActive).toBe(true)
    expect((await client.getCatalog({ country: 'FR', page: 1 })).currency).toBe('EUR')
    expect((await checkout.preview(world.buyerId, terroirCart([{ productId: world.shopA.productIds[0], quantity: 1 }], { departureId: world.departureId }))).country).toBe('FR')
  })
})
