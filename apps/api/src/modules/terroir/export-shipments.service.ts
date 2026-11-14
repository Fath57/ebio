import { EntityManager } from '@mikro-orm/postgresql'
import { HttpStatus, Injectable } from '@nestjs/common'
import { Order, OrderStatus } from '../orders/entities/order.entity'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { ExportShipmentStatus } from './contracts/terroir.contract'
import { ExportShipmentEvent } from './entities/export-shipment-event.entity'
import { ExportShipment } from './entities/export-shipment.entity'
import { terroirError } from './terroir-texts'

/** A parcel with what the buyer (or a gift's recipient) reads of it. */
export interface ShipmentView {
  shipment: ExportShipment
  /** Its orders, items, products and shops populated; cancelled ones left out. */
  orders: Order[]
  /** Oldest first. */
  events: ExportShipmentEvent[]
  collectionDays: number
}

/** Parcels nobody tracks: never paid, or abandoned. */
const UNTRACKED = [ExportShipmentStatus.PENDING_PAYMENT, ExportShipmentStatus.CANCELLED]

function shipmentNotFound() {
  return terroirError(HttpStatus.NOT_FOUND, 'EXPORT_SHIPMENT_NOT_FOUND', 'Colis introuvable.')
}

/**
 * Terroir parcels as their buyer and a gift's recipient follow them (011,
 * contracts §3). The back-office side — collection, weighing, steps — joins
 * this service in the next wave.
 */
@Injectable()
export class ExportShipmentsService {
  constructor(
    private readonly em: EntityManager,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  /** The buyer's parcels, newest first; unpaid checkouts left out. */
  async listForBuyer(buyerId: string): Promise<ShipmentView[]> {
    const shipments = await this.em.find(
      ExportShipment,
      { buyer: buyerId, status: { $ne: ExportShipmentStatus.PENDING_PAYMENT } },
      { populate: ['checkout', 'departure', 'departure.agency'], orderBy: { createdAt: 'DESC' }, limit: 100 },
    )
    return this.views(shipments, false)
  }

  /** One of the buyer's parcels, paid or still waiting for its payment. */
  async detailForBuyer(buyerId: string, shipmentId: string): Promise<ShipmentView> {
    const shipment = await this.em.findOne(
      ExportShipment,
      { id: shipmentId, buyer: buyerId },
      { populate: ['checkout', 'departure', 'departure.agency', 'pickupPoint'] },
    )
    if (!shipment) {
      throw shipmentNotFound()
    }
    const [view] = await this.views([shipment], true)
    return view
  }

  /** The public tracking of a parcel by its token (US10); 404 before payment. */
  async byToken(token: string): Promise<ShipmentView> {
    const shipment = await this.em.findOne(
      ExportShipment,
      { trackingToken: token, status: { $nin: UNTRACKED } },
      { populate: ['buyer', 'checkout', 'departure', 'departure.agency', 'pickupPoint'] },
    )
    if (!shipment) {
      throw shipmentNotFound()
    }
    const [view] = await this.views([shipment], true)
    return view
  }

  private async views(shipments: ExportShipment[], withEvents: boolean): Promise<ShipmentView[]> {
    if (shipments.length === 0) {
      return []
    }
    const { collectionDays } = await this.platformSettings.getTerroirExportSettings()
    const checkoutIds = shipments.map(shipment => shipment.checkout.id)
    const orders = await this.em.find(
      Order,
      { checkout: { $in: checkoutIds }, status: { $ne: OrderStatus.CANCELLED } },
      { populate: ['supplier', 'items', 'items.product', 'items.variant'], orderBy: { createdAt: 'ASC' } },
    )
    const events = withEvents
      ? await this.em.find(ExportShipmentEvent, { shipment: { $in: shipments.map(shipment => shipment.id) } }, { orderBy: { createdAt: 'ASC' } })
      : []
    return shipments.map(shipment => ({
      shipment,
      orders: orders.filter(order => order.checkout?.id === shipment.checkout.id),
      events: events.filter(event => event.shipment.id === shipment.id),
      collectionDays,
    }))
  }
}
