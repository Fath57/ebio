import type { CreateExportDeparture, ExportAgencyInput, ExportDepartureRateInput, ExportPickupPointInput, UpdateExportAgency, UpdateExportDeparture, UpdateExportPickupPoint } from './contracts/terroir.contract'
import type { OfferedDeparture } from './terroir-math'
import { EntityManager } from '@mikro-orm/postgresql'
import { HttpStatus, Injectable } from '@nestjs/common'
import { AuditService } from '../admin/audit.service'
import { User } from '../auth/auth.entity'
import { Order, OrderStatus } from '../orders/entities/order.entity'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { WalletTransactionType } from '../wallet/entities/wallet-transaction.entity'
import { PlatformAccount } from '../wallet/entities/wallet.entity'
import { WalletService } from '../wallet/wallet.service'
import { ExportDepartureStatus, ExportReception, ExportShipmentStatus } from './contracts/terroir.contract'
import { ExportAgency } from './entities/export-agency.entity'
import { ExportDepartureRate } from './entities/export-departure-rate.entity'
import { ExportDeparture } from './entities/export-departure.entity'
import { ExportPickupPoint } from './entities/export-pickup-point.entity'
import { ExportShipmentEvent } from './entities/export-shipment-event.entity'
import { ExportShipment } from './entities/export-shipment.entity'
import { availableDepartures, FILL_ALERT_RATIO, fillRatio, shippingPrice } from './terroir-math'
import { TerroirNotifierService } from './terroir-notifier.service'
import { addDays, spokenDay, terroirError } from './terroir-texts'

/** Parcels that no longer travel: they neither weigh on a departure nor move with it. */
const SETTLED_STATUSES = [ExportShipmentStatus.CANCELLED, ExportShipmentStatus.HANDED_OVER, ExportShipmentStatus.LOST, ExportShipmentStatus.DAMAGED]

/** Statuses that do not count against a departure's capacity. */
const NOT_RESERVING = [ExportShipmentStatus.PENDING_PAYMENT, ExportShipmentStatus.CANCELLED]

export interface DepartureView {
  departure: ExportDeparture
  reservedG: number
  shipmentCount: number
  collectionDays: number
}

export interface CollectionGroup {
  supplierId: string
  shopName: string
  lines: Array<{ shipmentId: string, orderId: string, name: string, quantity: number }>
  collected: boolean
}

export interface DepartureDetailView extends DepartureView {
  shipments: ExportShipment[]
  collection: CollectionGroup[]
}

export interface CancelDepartureResult {
  view: DepartureView
  reassigned: number
  surcharge: number
}

function departureUnavailable(message = 'Ce départ n\'est plus disponible.') {
  return terroirError(HttpStatus.CONFLICT, 'DEPARTURE_UNAVAILABLE', message)
}

function departureNotFound() {
  return terroirError(HttpStatus.NOT_FOUND, 'EXPORT_DEPARTURE_NOT_FOUND', 'Départ introuvable.')
}

function agencyNotFound() {
  return terroirError(HttpStatus.NOT_FOUND, 'EXPORT_AGENCY_NOT_FOUND', 'Agence introuvable.')
}

/**
 * Partner agencies, their pickup points and their departures (011, US2):
 * what eBio enters in the back office every week, the fill of each
 * departure, and what happens to its parcels when one is cancelled.
 */
@Injectable()
export class ExportLogisticsService {
  constructor(
    private readonly em: EntityManager,
    private readonly wallets: WalletService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly notifier: TerroirNotifierService,
    private readonly audit: AuditService,
  ) {}

  // ===== AGENCIES =====

  async listAgencies(): Promise<ExportAgency[]> {
    return this.em.find(ExportAgency, {}, { populate: ['pickupPoints'], orderBy: { name: 'ASC' } })
  }

  async createAgency(input: ExportAgencyInput, actorUserId: string): Promise<ExportAgency> {
    const agency = this.em.create(ExportAgency, {
      name: input.name,
      contactName: input.contactName ?? null,
      contactPhone: input.contactPhone ?? null,
      contactEmail: input.contactEmail ?? null,
      notes: input.notes ?? null,
      active: input.active ?? true,
    })
    await this.em.flush()
    await this.audit.record({ actorUserId, action: 'EXPORT_AGENCY_CREATED', targetType: 'export_agency', targetId: agency.id, payload: { name: agency.name } })
    return this.getAgency(agency.id)
  }

  async updateAgency(id: string, input: UpdateExportAgency): Promise<ExportAgency> {
    const agency = await this.getAgency(id)
    this.em.assign(agency, input)
    await this.em.flush()
    return agency
  }

  async getAgency(id: string): Promise<ExportAgency> {
    const agency = await this.em.findOne(ExportAgency, { id }, { populate: ['pickupPoints'], refresh: true })
    if (!agency) {
      throw agencyNotFound()
    }
    return agency
  }

  // ===== PICKUP POINTS =====

  async listPickupPoints(agencyId: string): Promise<ExportPickupPoint[]> {
    await this.getAgency(agencyId)
    return this.em.find(ExportPickupPoint, { agency: agencyId }, { orderBy: { country: 'ASC', city: 'ASC' } })
  }

  async createPickupPoint(agencyId: string, input: ExportPickupPointInput, actorUserId: string): Promise<ExportPickupPoint> {
    const agency = await this.getAgency(agencyId)
    const point = this.em.create(ExportPickupPoint, {
      agency,
      country: input.country,
      city: input.city,
      address: input.address,
      openingHours: input.openingHours ?? null,
      active: input.active ?? true,
    })
    await this.em.flush()
    await this.audit.record({ actorUserId, action: 'EXPORT_PICKUP_POINT_CREATED', targetType: 'export_agency', targetId: agency.id, payload: { pickupPointId: point.id, city: point.city } })
    return point
  }

  async updatePickupPoint(agencyId: string, pointId: string, input: UpdateExportPickupPoint): Promise<ExportPickupPoint> {
    const point = await this.em.findOne(ExportPickupPoint, { id: pointId, agency: agencyId })
    if (!point) {
      throw terroirError(HttpStatus.NOT_FOUND, 'EXPORT_PICKUP_POINT_NOT_FOUND', 'Point de retrait introuvable.')
    }
    this.em.assign(point, input)
    await this.em.flush()
    return point
  }

  // ===== DEPARTURES =====

  async listDepartures(status?: ExportDepartureStatus): Promise<DepartureView[]> {
    const departures = await this.em.find(
      ExportDeparture,
      status ? { status } : {},
      { populate: ['agency', 'rates'], orderBy: { departsOn: 'DESC', createdAt: 'DESC' } },
    )
    const usage = await this.usageOf(departures.map(departure => departure.id))
    const { collectionDays } = await this.platformSettings.getTerroirExportSettings()
    return departures.map(departure => ({
      departure,
      reservedG: usage.get(departure.id)?.reservedG ?? 0,
      shipmentCount: usage.get(departure.id)?.count ?? 0,
      collectionDays,
    }))
  }

  async createDeparture(input: CreateExportDeparture, actorUserId: string): Promise<DepartureView> {
    const agency = await this.getAgency(input.agencyId)
    if (!agency.active) {
      throw terroirError(HttpStatus.BAD_REQUEST, 'EXPORT_AGENCY_INACTIVE', 'Cette agence est désactivée.')
    }
    this.assertDates(input.departsOn, new Date(input.depositDeadline), input.transitMinDays, input.transitMaxDays)
    this.assertRates(input.rates)

    const departure = this.em.create(ExportDeparture, {
      agency,
      departsOn: input.departsOn,
      depositDeadline: new Date(input.depositDeadline),
      transitMinDays: input.transitMinDays,
      transitMaxDays: input.transitMaxDays,
      capacityKg: input.capacityKg == null ? null : String(input.capacityKg),
    })
    for (const rate of input.rates) {
      this.em.create(ExportDepartureRate, { departure, ...this.rateColumns(rate) })
    }
    await this.em.flush()
    await this.audit.record({
      actorUserId,
      action: 'EXPORT_DEPARTURE_CREATED',
      targetType: 'export_departure',
      targetId: departure.id,
      payload: { agencyId: agency.id, departsOn: input.departsOn, rates: input.rates },
    })
    return this.view(departure.id)
  }

  async updateDeparture(id: string, input: UpdateExportDeparture, actorUserId: string): Promise<DepartureView> {
    const departure = await this.getDeparture(id)
    if (departure.status === ExportDepartureStatus.CANCELLED) {
      throw terroirError(HttpStatus.CONFLICT, 'EXPORT_DEPARTURE_CANCELLED', 'Ce départ est annulé : il ne peut plus être modifié.')
    }
    if (input.agencyId !== undefined && input.agencyId !== departure.agency.id) {
      departure.agency = await this.getAgency(input.agencyId)
    }
    const departsOn = input.departsOn ?? departure.departsOn
    const deadline = input.depositDeadline ? new Date(input.depositDeadline) : departure.depositDeadline
    this.assertDates(departsOn, deadline, input.transitMinDays ?? departure.transitMinDays, input.transitMaxDays ?? departure.transitMaxDays)

    departure.departsOn = departsOn
    departure.depositDeadline = deadline
    departure.transitMinDays = input.transitMinDays ?? departure.transitMinDays
    departure.transitMaxDays = input.transitMaxDays ?? departure.transitMaxDays
    if (input.capacityKg !== undefined) {
      departure.capacityKg = input.capacityKg == null ? null : String(input.capacityKg)
    }
    if (input.status !== undefined) {
      departure.status = input.status
    }
    // Rates already paid are frozen on the parcels: replacing them here only
    // changes what future buyers see.
    if (input.rates !== undefined) {
      this.assertRates(input.rates)
      departure.rates.removeAll()
      for (const rate of input.rates) {
        departure.rates.add(this.em.create(ExportDepartureRate, { departure, ...this.rateColumns(rate) }))
      }
    }
    await this.em.flush()
    await this.audit.record({ actorUserId, action: 'EXPORT_DEPARTURE_UPDATED', targetType: 'export_departure', targetId: id, payload: { ...input } })
    // A larger capacity does not reopen a FULL departure by itself; a smaller one may close it.
    await this.refreshFill(id)
    return this.view(id)
  }

  async view(id: string): Promise<DepartureView> {
    const departure = await this.getDeparture(id)
    const usage = await this.usageOf([id])
    const { collectionDays } = await this.platformSettings.getTerroirExportSettings()
    return {
      departure,
      reservedG: usage.get(id)?.reservedG ?? 0,
      shipmentCount: usage.get(id)?.count ?? 0,
      collectionDays,
    }
  }

  /** The departure, its fill, its parcels and what to collect from each shop (FR-019). */
  async detail(id: string): Promise<DepartureDetailView> {
    const view = await this.view(id)
    const shipments = await this.em.find(
      ExportShipment,
      { departure: id, status: { $ne: ExportShipmentStatus.PENDING_PAYMENT } },
      { populate: ['buyer'], orderBy: { createdAt: 'ASC' } },
    )
    const byCheckout = new Map(shipments.map(shipment => [shipment.checkout.id, shipment]))
    const orders = byCheckout.size === 0
      ? []
      : await this.em.find(
          Order,
          { checkout: { $in: [...byCheckout.keys()] }, status: { $nin: [OrderStatus.CANCELLED, OrderStatus.PENDING_PAYMENT] } },
          { populate: ['supplier', 'items', 'items.product'], orderBy: { createdAt: 'ASC' } },
        )

    const groups = new Map<string, CollectionGroup>()
    for (const order of orders) {
      const shipment = order.checkout ? byCheckout.get(order.checkout.id) : undefined
      if (!shipment) {
        continue
      }
      const group = groups.get(order.supplier.id) ?? {
        supplierId: order.supplier.id,
        shopName: order.supplier.shopName,
        lines: [],
        collected: true,
      }
      for (const item of order.items) {
        group.lines.push({ shipmentId: shipment.id, orderId: order.id, name: item.product.name, quantity: item.quantity })
      }
      group.collected = group.collected && order.status === OrderStatus.DELIVERED
      groups.set(order.supplier.id, group)
    }
    return { ...view, shipments, collection: [...groups.values()].sort((a, b) => a.shopName.localeCompare(b.shopName)) }
  }

  /**
   * Cancels a departure (FR-023). Its parcels either wait on it, the buyers
   * told, or move to `reassignTo` at no cost to them: when the new route is
   * dearer, eBio pays the difference from its EXPORT account. Called again
   * on an already cancelled departure, it reassigns the parcels still on it.
   */
  async cancel(id: string, reassignTo: string | null | undefined, actorUserId: string): Promise<CancelDepartureResult> {
    const departure = await this.getDeparture(id)
    if (departure.status === ExportDepartureStatus.DEPARTED) {
      throw terroirError(HttpStatus.CONFLICT, 'EXPORT_DEPARTURE_DEPARTED', 'Ce départ est déjà parti : il ne peut plus être annulé.')
    }
    if (reassignTo === id) {
      throw departureUnavailable('Choisissez un autre départ pour réaffecter les colis.')
    }

    const moves: Array<{ shipment: ExportShipment, surcharge: number }> = []
    let target: ExportDeparture | null = null

    await this.em.transactional(async (em) => {
      await em.execute(`SELECT id FROM export_departures WHERE id = ? FOR UPDATE`, [id])
      const own = await em.findOneOrFail(ExportDeparture, { id })
      own.status = ExportDepartureStatus.CANCELLED
      const shipments = await em.find(
        ExportShipment,
        { departure: id, status: { $nin: [...SETTLED_STATUSES, ExportShipmentStatus.PENDING_PAYMENT] } },
        { populate: ['pickupPoint'] },
      )
      if (reassignTo) {
        target = await this.lockOpenDeparture(em, reassignTo)
        await this.planMoves(em, target, shipments, moves)
        for (const { shipment } of moves) {
          shipment.departure = target
          em.create(ExportShipmentEvent, {
            shipment,
            step: null,
            message: `Départ du ${spokenDay(departure.departsOn)} annulé : votre colis partira le ${spokenDay(target.departsOn)} avec ${target.agency.name}.`,
            author: em.getReference(User, actorUserId),
          })
        }
      }
      else {
        moves.push(...shipments.map(shipment => ({ shipment, surcharge: 0 })))
      }
      await em.flush()
    })

    const surcharge = moves.reduce((total, move) => total + move.surcharge, 0)
    const reassignedTo = target as ExportDeparture | null
    for (const { shipment, surcharge: extra } of moves) {
      if (reassignedTo) {
        await this.wallets.post(PlatformAccount.EXPORT, 'debit', {
          type: WalletTransactionType.EXPORT_LOSS,
          amount: extra,
          description: `Surcoût de réaffectation — colis ${shipment.id.slice(0, 8)} vers le départ du ${spokenDay(reassignedTo.departsOn)}`,
        })
        await this.notifier.shipmentReassigned({
          buyerId: shipment.buyer.id,
          shipmentId: shipment.id,
          departsOn: reassignedTo.departsOn,
          arrivalFrom: addDays(reassignedTo.departsOn, reassignedTo.transitMinDays),
          arrivalTo: addDays(reassignedTo.departsOn, reassignedTo.transitMaxDays),
        })
      }
      else {
        await this.notifier.shipmentOnHold({ buyerId: shipment.buyer.id, shipmentId: shipment.id, departsOn: departure.departsOn })
      }
    }

    await this.audit.record({
      actorUserId,
      action: 'EXPORT_DEPARTURE_CANCELLED',
      targetType: 'export_departure',
      targetId: id,
      payload: { reassignTo: reassignTo ?? null, parcels: moves.length, surcharge },
    })
    if (reassignedTo) {
      await this.refreshFill(reassignedTo.id)
    }
    this.em.clear()
    return { view: await this.view(id), reassigned: reassignedTo ? moves.length : 0, surcharge }
  }

  /**
   * What a buyer abroad may pick for a parcel of `weightG` towards `country`
   * (FR-010): open, not past the order deadline, with room, accepting the
   * weight. Soonest first; `departure.id` names the entity in `departures`.
   */
  async offerableDepartures(country: string, weightG: number, now = new Date()): Promise<{ offers: OfferedDeparture[], departures: Map<string, ExportDeparture> }> {
    const departures = await this.em.find(
      ExportDeparture,
      { status: ExportDepartureStatus.OPEN, depositDeadline: { $gt: now } },
      { populate: ['agency', 'rates'] },
    )
    const usage = await this.usageOf(departures.map(departure => departure.id))
    const { collectionDays } = await this.platformSettings.getTerroirExportSettings()
    const offers = availableDepartures(departures.map(departure => ({
      id: departure.id,
      status: departure.status,
      departsOn: departure.departsOn,
      depositDeadline: departure.depositDeadline,
      capacityKg: departure.capacityKg == null ? null : Number(departure.capacityKg),
      reservedG: usage.get(departure.id)?.reservedG ?? 0,
      rates: departure.rates.getItems().map(rate => ({
        country: rate.country,
        pricePerKg: Number(rate.pricePerKg),
        minBilledKg: Number(rate.minBilledKg),
        maxWeightKg: rate.maxWeightKg == null ? null : Number(rate.maxWeightKg),
        homeDeliveryFee: rate.homeDeliveryFee == null ? null : Number(rate.homeDeliveryFee),
      })),
    })), country, weightG, now, collectionDays)
    return { offers, departures: new Map(departures.map(departure => [departure.id, departure])) }
  }

  // ===== FILL =====

  /** Grams reserved on a departure: real weight once weighed, else the estimate, of paid parcels. */
  async reservedG(departureId: string, em: EntityManager = this.em): Promise<number> {
    // `em.execute` runs inside the caller's transaction when there is one.
    const [row] = await em.execute<Array<{ reserved: number }>>(
      `SELECT COALESCE(SUM(COALESCE(actual_weight_g, estimated_weight_g)), 0)::int AS reserved
       FROM export_shipments
       WHERE departure_id = ? AND status NOT IN (${NOT_RESERVING.map(() => '?').join(', ')})`,
      [departureId, ...NOT_RESERVING],
    )
    return Number(row?.reserved ?? 0)
  }

  /**
   * Alerts the team once at 80 % and closes the departure at 100 % (FR-010a).
   * Both writes are conditional, so concurrent payments alert and close once.
   */
  async refreshFill(departureId: string): Promise<void> {
    const departure = await this.em.fork().findOne(ExportDeparture, { id: departureId }, { populate: ['agency'] })
    if (!departure || departure.capacityKg == null) {
      return
    }
    const ratio = fillRatio(await this.reservedG(departureId), Number(departure.capacityKg))
    if (ratio === null) {
      return
    }
    const connection = this.em.getConnection()
    if (ratio >= FILL_ALERT_RATIO) {
      const alerted = await connection.execute(
        `UPDATE export_departures SET fill_alerted_at = NOW() WHERE id = ? AND fill_alerted_at IS NULL RETURNING id`,
        [departureId],
      ) as Array<{ id: string }>
      if (alerted.length > 0) {
        await this.notifier.departureFill({ departureId, agencyName: departure.agency.name, departsOn: departure.departsOn, ratio })
      }
    }
    if (ratio >= 1) {
      await connection.execute(
        `UPDATE export_departures SET status = ?, updated_at = NOW() WHERE id = ? AND status = ?`,
        [ExportDepartureStatus.FULL, departureId, ExportDepartureStatus.OPEN],
      )
    }
  }

  // ===== INTERNALS =====

  private async getDeparture(id: string): Promise<ExportDeparture> {
    const departure = await this.em.findOne(ExportDeparture, { id }, { populate: ['agency', 'rates'], refresh: true })
    if (!departure) {
      throw departureNotFound()
    }
    return departure
  }

  /** The target of a reassignment, locked so concurrent payments wait for the move. */
  private async lockOpenDeparture(em: EntityManager, id: string): Promise<ExportDeparture> {
    const [locked] = await em.execute<Array<{ id: string }>>(
      `SELECT id FROM export_departures WHERE id = ? FOR UPDATE`,
      [id],
    )
    if (!locked) {
      throw departureNotFound()
    }
    const target = await em.findOneOrFail(ExportDeparture, { id }, { populate: ['agency', 'rates'] })
    if (target.status !== ExportDepartureStatus.OPEN) {
      throw departureUnavailable('Le départ choisi n\'est pas ouvert.')
    }
    return target
  }

  /**
   * Checks every parcel fits the target — country served, weight accepted,
   * room left, home delivery still offered, a pickup point in the same
   * country — and works out eBio's surcharge for each. All or nothing.
   */
  private async planMoves(em: EntityManager, target: ExportDeparture, shipments: ExportShipment[], moves: Array<{ shipment: ExportShipment, surcharge: number }>): Promise<void> {
    let incomingG = 0
    const points = await em.find(ExportPickupPoint, { agency: target.agency.id, active: true }, { orderBy: { city: 'ASC' } })
    for (const shipment of shipments) {
      const rate = target.rates.getItems().find(candidate => candidate.country === shipment.country)
      if (!rate) {
        throw departureUnavailable('Le départ choisi ne dessert pas le pays de tous les colis.')
      }
      const weightG = shipment.actualWeightG ?? shipment.estimatedWeightG
      if (rate.maxWeightKg != null && weightG > Number(rate.maxWeightKg) * 1000) {
        throw departureUnavailable('Un colis dépasse le poids maximum du départ choisi.')
      }
      incomingG += weightG

      const terms = { pricePerKg: Number(rate.pricePerKg), minBilledKg: Number(rate.minBilledKg) }
      let surcharge = Math.max(0, shippingPrice(weightG, terms) - Number(shipment.shippingPrice))
      if (shipment.reception === ExportReception.HOME) {
        if (rate.homeDeliveryFee == null) {
          throw terroirError(HttpStatus.CONFLICT, 'HOME_DELIVERY_UNAVAILABLE', 'Le départ choisi ne livre pas à domicile dans ce pays.')
        }
        surcharge += Math.max(0, Number(rate.homeDeliveryFee) - Number(shipment.homeDeliveryFee))
      }
      else if (shipment.pickupPoint?.agency.id !== target.agency.id) {
        // Another agency: the nearest equivalent, same city first.
        const sameCountry = points.filter(point => point.country === shipment.country)
        const point = sameCountry.find(candidate => candidate.city === shipment.pickupPoint?.city) ?? sameCountry[0]
        if (!point) {
          throw terroirError(HttpStatus.CONFLICT, 'PICKUP_POINT_REQUIRED', 'L\'agence du départ choisi n\'a pas de point de retrait dans ce pays.')
        }
        shipment.pickupPoint = point
      }
      moves.push({ shipment, surcharge })
    }

    if (target.capacityKg != null) {
      const reserved = await this.reservedG(target.id, em)
      if (reserved + incomingG > Number(target.capacityKg) * 1000) {
        throw departureUnavailable('Le départ choisi n\'a pas assez de place pour ces colis.')
      }
    }
  }

  private async usageOf(ids: string[]): Promise<Map<string, { reservedG: number, count: number }>> {
    if (ids.length === 0) {
      return new Map()
    }
    const rows = await this.em.getConnection().execute(
      `SELECT departure_id,
              COALESCE(SUM(COALESCE(actual_weight_g, estimated_weight_g)), 0)::int AS reserved,
              COUNT(*)::int AS count
       FROM export_shipments
       WHERE departure_id IN (${ids.map(() => '?').join(', ')})
         AND status NOT IN (${NOT_RESERVING.map(() => '?').join(', ')})
       GROUP BY departure_id`,
      [...ids, ...NOT_RESERVING],
    ) as Array<{ departure_id: string, reserved: number, count: number }>
    return new Map(rows.map(row => [row.departure_id, { reservedG: Number(row.reserved), count: Number(row.count) }]))
  }

  private assertDates(departsOn: string, deadline: Date, transitMin: number, transitMax: number): void {
    if (Number.isNaN(deadline.getTime()) || deadline.getTime() > new Date(`${departsOn}T23:59:59Z`).getTime()) {
      throw terroirError(HttpStatus.BAD_REQUEST, 'EXPORT_DEPARTURE_INVALID', 'La date limite de dépôt doit précéder le départ.')
    }
    if (transitMin > transitMax) {
      throw terroirError(HttpStatus.BAD_REQUEST, 'EXPORT_DEPARTURE_INVALID', 'Le délai minimum doit être inférieur ou égal au délai maximum.')
    }
  }

  private assertRates(rates: ExportDepartureRateInput[]): void {
    const countries = rates.map(rate => rate.country)
    if (new Set(countries).size !== countries.length) {
      throw terroirError(HttpStatus.BAD_REQUEST, 'EXPORT_DEPARTURE_INVALID', 'Un seul tarif par pays.')
    }
  }

  private rateColumns(rate: ExportDepartureRateInput) {
    return {
      country: rate.country,
      pricePerKg: String(rate.pricePerKg),
      minBilledKg: String(rate.minBilledKg),
      maxWeightKg: rate.maxWeightKg == null ? null : String(rate.maxWeightKg),
      homeDeliveryFee: rate.homeDeliveryFee == null ? null : String(rate.homeDeliveryFee),
    }
  }
}
