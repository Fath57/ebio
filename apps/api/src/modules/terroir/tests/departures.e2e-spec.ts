import type { INestApplication } from '@nestjs/common'
import { EntityManager } from '@mikro-orm/postgresql'
import { beforeEach, describe, expect, it } from 'vitest'
import { createUserData } from '../../../factories/user.factory'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { PlatformAccount } from '../../wallet/entities/wallet.entity'
import { WalletService } from '../../wallet/wallet.service'
import { ExportDepartureStatus, ExportShipmentStatus } from '../contracts/terroir.contract'
import { ExportShipment } from '../entities/export-shipment.entity'
import { ExportLogisticsService } from '../export-logistics.service'
import { TerroirMapper } from '../terroir.mapper'
import { TerroirModule } from '../terroir.module'
import { dayFromNow, instantFromNow, muteOutbound, refusalOf, seedExportCountries, seedShipment } from './terroir.fixture'

interface Agency {
  agencyId: string
  parisId: string
  bruxellesId: string
}

async function seedAgency(service: ExportLogisticsService, actorId: string, name = 'Bénin Express'): Promise<Agency> {
  const agency = await service.createAgency({ name, contactName: 'Koffi', contactPhone: '+33 6 12 34 56 78' }, actorId)
  const paris = await service.createPickupPoint(agency.id, { country: 'FR', city: 'Paris', address: '12 rue Myrha, 75018 Paris', openingHours: 'mar.–sam. 10 h–19 h' }, actorId)
  const bruxelles = await service.createPickupPoint(agency.id, { country: 'BE', city: 'Bruxelles', address: '4 chaussée d\'Ixelles, 1050 Ixelles' }, actorId)
  return { agencyId: agency.id, parisId: paris.id, bruxellesId: bruxelles.id }
}

async function seedDeparture(service: ExportLogisticsService, actorId: string, agencyId: string, overrides: { inDays?: number, capacityKg?: number | null, pricePerKg?: number } = {}): Promise<string> {
  const inDays = overrides.inDays ?? 9
  const view = await service.createDeparture({
    agencyId,
    departsOn: dayFromNow(inDays),
    depositDeadline: instantFromNow(inDays - 2),
    transitMinDays: 7,
    transitMaxDays: 11,
    capacityKg: overrides.capacityKg === undefined ? 100 : overrides.capacityKg,
    rates: [
      { country: 'FR', pricePerKg: overrides.pricePerKg ?? 8500, minBilledKg: 5, maxWeightKg: 30, homeDeliveryFee: 3900 },
      { country: 'BE', pricePerKg: 9000, minBilledKg: 5 },
    ],
  }, actorId)
  return view.departure.id
}

function fresh(app: INestApplication): void {
  app.get(EntityManager).clear()
}

/**
 * US2: eBio enters agencies and departures; buyers only ever see departures
 * that are open, not past their deadline, and not full. A cancelled
 * departure's parcels move at eBio's expense.
 */
describe('terroir, agences et départs (e2e)', { timeout: 30_000 }, () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 4 }, {
      imports: [RolesModule, AuditModule, TerroirModule],
    })
    muteOutbound(app)
    context.app = app
    context.em = orm.em.fork()
    await seedExportCountries(context.em as EntityManager)
  })

  it('crée un départ avec ses tarifs France et Belgique, tracé dans le journal', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const staff = await createUserData(em, { name: 'Agent eBio' })
    const service = app.get(ExportLogisticsService)
    const agency = await seedAgency(service, staff.id)

    const departureId = await seedDeparture(service, staff.id, agency.agencyId)
    fresh(app)
    const [listed] = (await service.listDepartures()).map(TerroirMapper.toDeparture)

    expect(listed.id).toBe(departureId)
    expect(listed.agency.name).toBe('Bénin Express')
    expect(listed.status).toBe('OPEN')
    expect(listed.rates).toEqual([
      { country: 'BE', pricePerKg: 9000, minBilledKg: 5, maxWeightKg: null, homeDeliveryFee: null },
      { country: 'FR', pricePerKg: 8500, minBilledKg: 5, maxWeightKg: 30, homeDeliveryFee: 3900 },
    ])
    expect(listed.arrival).toEqual({ from: dayFromNow(16), to: dayFromNow(20) })
    expect(listed.fill).toEqual({ reservedKg: 0, capacityKg: 100, ratio: 0 })

    const [audit] = await em.getConnection().execute(
      `SELECT actor_user_id FROM audit_logs WHERE action = 'EXPORT_DEPARTURE_CREATED' AND target_id = ?`,
      [departureId],
    ) as Array<{ actor_user_id: string }>
    expect(audit.actor_user_id).toBe(staff.id)
  })

  it('refuse une date limite de dépôt après le départ et un tarif en double', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const staff = await createUserData(em)
    const service = app.get(ExportLogisticsService)
    const { agencyId } = await seedAgency(service, staff.id)
    const base = { agencyId, departsOn: dayFromNow(9), transitMinDays: 7, transitMaxDays: 11 }

    expect(await refusalOf(service.createDeparture({
      ...base,
      depositDeadline: instantFromNow(11),
      rates: [{ country: 'FR', pricePerKg: 8500, minBilledKg: 5 }],
    }, staff.id))).toEqual({ status: 400, code: 'EXPORT_DEPARTURE_INVALID' })
    expect(await refusalOf(service.createDeparture({
      ...base,
      depositDeadline: instantFromNow(7),
      rates: [{ country: 'FR', pricePerKg: 8500, minBilledKg: 5 }, { country: 'FR', pricePerKg: 9000, minBilledKg: 5 }],
    }, staff.id))).toEqual({ status: 400, code: 'EXPORT_DEPARTURE_INVALID' })
  })

  it('ne propose ni un départ échu compte tenu de la collecte, ni un départ plein', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const staff = await createUserData(em)
    const buyer = await createUserData(em, { name: 'Awa Diallo' })
    const service = app.get(ExportLogisticsService)
    const agency = await seedAgency(service, staff.id)
    // Deposit deadline in 2 days: past the 3 collection days already.
    const tooLate = await seedDeparture(service, staff.id, agency.agencyId, { inDays: 4 })
    const soon = await seedDeparture(service, staff.id, agency.agencyId, { inDays: 9, capacityKg: 10 })
    const later = await seedDeparture(service, staff.id, agency.agencyId, { inDays: 16 })

    let { offers } = await service.offerableDepartures('FR', 3000)
    expect(offers.map(offer => offer.departure.id)).toEqual([soon, later])
    expect(offers[0].shippingPrice).toBe(42_500)
    expect(offers.map(offer => offer.departure.id)).not.toContain(tooLate)

    // 8 kg reserved on a 10 kg departure: alerted at 80 %, and a 3 kg parcel no longer fits.
    await seedShipment(em, { buyerId: buyer.id, departureId: soon, pickupPointId: agency.parisId, country: 'FR', estimatedWeightG: 8000, shippingPrice: 68_000, pricePerKg: 8500, minBilledKg: 5 })
    await service.refreshFill(soon)
    fresh(app)
    ;({ offers } = await service.offerableDepartures('FR', 3000))
    expect(offers.map(offer => offer.departure.id)).toEqual([later])
    expect((await service.view(soon)).departure.fillAlertedAt).not.toBeNull()

    // 10 kg: full, closed for everyone.
    await seedShipment(em, { buyerId: buyer.id, departureId: soon, pickupPointId: agency.parisId, country: 'FR', estimatedWeightG: 2000, shippingPrice: 42_500, pricePerKg: 8500, minBilledKg: 5 })
    await service.refreshFill(soon)
    fresh(app)
    const closed = await service.view(soon)
    expect(closed.departure.status).toBe(ExportDepartureStatus.FULL)
    expect(TerroirMapper.toDeparture(closed).fill).toEqual({ reservedKg: 10, capacityKg: 10, ratio: 1 })
    ;({ offers } = await service.offerableDepartures('FR', 500))
    expect(offers.map(offer => offer.departure.id)).toEqual([later])
  })

  it('annule un départ et réaffecte ses colis, le surcoût porté par le compte EXPORT', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const staff = await createUserData(em)
    const buyer = await createUserData(em, { name: 'Awa Diallo' })
    const service = app.get(ExportLogisticsService)
    const first = await seedAgency(service, staff.id)
    const second = await seedAgency(service, staff.id, 'Afrik Fret')
    const cancelled = await seedDeparture(service, staff.id, first.agencyId)
    // Dearer route: 10 000 per kilo instead of 8 500.
    const target = await seedDeparture(service, staff.id, second.agencyId, { inDays: 12, pricePerKg: 10_000 })
    const shipmentId = await seedShipment(em, {
      buyerId: buyer.id,
      departureId: cancelled,
      pickupPointId: first.parisId,
      country: 'FR',
      estimatedWeightG: 3000,
      shippingPrice: 42_500,
      pricePerKg: 8500,
      minBilledKg: 5,
    })

    const result = await service.cancel(cancelled, target, staff.id)

    expect(result.reassigned).toBe(1)
    expect(result.surcharge).toBe(7500)
    expect(result.view.departure.status).toBe(ExportDepartureStatus.CANCELLED)

    fresh(app)
    const shipment = await em.fork().findOneOrFail(ExportShipment, { id: shipmentId }, { populate: ['pickupPoint'] })
    expect(shipment.departure.id).toBe(target)
    // The buyer keeps the price they paid; the new agency's Paris point takes over.
    expect(Number(shipment.shippingPrice)).toBe(42_500)
    expect(shipment.pickupPoint?.id).toBe(second.parisId)
    expect(shipment.status).toBe(ExportShipmentStatus.PAID)

    const exportWallet = await app.get(WalletService).getOrCreate({ platformAccount: PlatformAccount.EXPORT })
    expect(Number(exportWallet.balance)).toBe(-7500)
    const [loss] = await em.getConnection().execute(
      `SELECT type, amount FROM wallet_transactions WHERE wallet_id = ?`,
      [exportWallet.id],
    ) as Array<{ type: string, amount: string }>
    expect(loss.type).toBe('EXPORT_LOSS')
    expect(Number(loss.amount)).toBe(-7500)

    const [event] = await em.getConnection().execute(
      `SELECT message FROM export_shipment_events WHERE shipment_id = ?`,
      [shipmentId],
    ) as Array<{ message: string }>
    expect(event.message).toContain('Afrik Fret')
    const [notice] = await em.getConnection().execute(
      `SELECT type FROM notifications WHERE "userId" = ?`,
      [buyer.id],
    ) as Array<{ type: string }>
    expect(notice.type).toBe('EXPORT_SHIPMENT_UPDATE')
    expect((await service.view(target)).shipmentCount).toBe(1)
  })

  it('refuse de réaffecter vers un départ qui ne dessert pas le pays, sans rien changer', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const staff = await createUserData(em)
    const buyer = await createUserData(em)
    const service = app.get(ExportLogisticsService)
    const agency = await seedAgency(service, staff.id)
    const cancelled = await seedDeparture(service, staff.id, agency.agencyId)
    const belgiumOnly = await service.createDeparture({
      agencyId: agency.agencyId,
      departsOn: dayFromNow(12),
      depositDeadline: instantFromNow(10),
      transitMinDays: 7,
      transitMaxDays: 11,
      rates: [{ country: 'BE', pricePerKg: 9000, minBilledKg: 5 }],
    }, staff.id)
    await seedShipment(em, { buyerId: buyer.id, departureId: cancelled, pickupPointId: agency.parisId, country: 'FR', estimatedWeightG: 3000, shippingPrice: 42_500, pricePerKg: 8500, minBilledKg: 5 })

    expect(await refusalOf(service.cancel(cancelled, belgiumOnly.departure.id, staff.id))).toEqual({ status: 409, code: 'DEPARTURE_UNAVAILABLE' })
    fresh(app)
    expect((await service.view(cancelled)).departure.status).toBe(ExportDepartureStatus.OPEN)
  })
})
