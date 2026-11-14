import type { OnModuleInit } from '@nestjs/common'
import type { ExportDepartureEventInput, ExportShipmentEventInput } from './contracts/terroir.contract'
import type { ShipmentNews } from './terroir-notifier.service'
import { EntityManager } from '@mikro-orm/postgresql'
import { HttpStatus, Injectable } from '@nestjs/common'
import { AuditService } from '../admin/audit.service'
import { User } from '../auth/auth.entity'
import { OrderItem } from '../orders/entities/order-item.entity'
import { Order, OrderStatus } from '../orders/entities/order.entity'
import { OrdersService } from '../orders/orders.service'
import { Payment, PaymentStatus } from '../payments/payment.entity'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { WalletTransactionType } from '../wallet/entities/wallet-transaction.entity'
import { PlatformAccount } from '../wallet/entities/wallet.entity'
import { WalletService } from '../wallet/wallet.service'
import { ExportDepartureStatus, ExportReception, ExportShipmentStatus, ExportSupplementStatus } from './contracts/terroir.contract'
import { ExportCountry } from './entities/export-country.entity'
import { ExportDeparture } from './entities/export-departure.entity'
import { ExportProfile } from './entities/export-profile.entity'
import { ExportShipmentEvent } from './entities/export-shipment-event.entity'
import { ExportShipment } from './entities/export-shipment.entity'
import { lineWeight } from './export-catalog.service'
import { ExportLogisticsService } from './export-logistics.service'
import { insurancePrice, shippingPrice, supplementFor } from './terroir-math'
import { TerroirNotifierService } from './terroir-notifier.service'
import { spokenDay, terroirError } from './terroir-texts'

/** A parcel with what the buyer (or a gift's recipient) reads of it. */
export interface ShipmentView {
  shipment: ExportShipment
  /** Its orders, items, products and shops populated; cancelled ones left out. */
  orders: Order[]
  /** Oldest first. */
  events: ExportShipmentEvent[]
  collectionDays: number
}

/** A parcel as the back office handles it: every order, cancelled ones too. */
export interface AdminShipmentView {
  shipment: ExportShipment
  orders: Order[]
  events: ExportShipmentEvent[]
}

/** How long the buyer has to answer a weight supplement before eBio absorbs it (FR-020). */
export const SUPPLEMENT_WINDOW_HOURS = 48

const HOUR_MS = 60 * 60 * 1000

/** The franc fixed to the euro: 1 € = 655,957 FCFA. Declared values follow the peg, not the app's display rate. */
const XOF_PER_EUR = 655.957

/** Parcels nobody tracks: never paid, or abandoned. */
const UNTRACKED = [ExportShipmentStatus.PENDING_PAYMENT, ExportShipmentStatus.CANCELLED]

/** Parcels still at eBio's: products can be collected, missing, removed. */
const AT_EBIO = [ExportShipmentStatus.PAID, ExportShipmentStatus.COLLECTING, ExportShipmentStatus.PACKED]

/** Parcels that no longer move. */
const SETTLED = [ExportShipmentStatus.HANDED_OVER, ExportShipmentStatus.LOST, ExportShipmentStatus.DAMAGED, ExportShipmentStatus.CANCELLED]

/** Packed and on its way: what can get lost or damaged. */
const LOSABLE = [
  ExportShipmentStatus.PACKED,
  ExportShipmentStatus.DROPPED_AT_AGENCY,
  ExportShipmentStatus.DEPARTED,
  ExportShipmentStatus.ARRIVED,
  ExportShipmentStatus.READY_FOR_PICKUP,
  ExportShipmentStatus.OUT_FOR_DELIVERY,
]

/** Steps with their own action (payment, hand-over, loss, cancellation): never set by hand. */
const RESERVED_STEPS = [
  ExportShipmentStatus.PENDING_PAYMENT,
  ExportShipmentStatus.PAID,
  ExportShipmentStatus.HANDED_OVER,
  ExportShipmentStatus.LOST,
  ExportShipmentStatus.DAMAGED,
  ExportShipmentStatus.CANCELLED,
]

/** Shop statuses a terroir order can be collected from: accepted, so its stock was taken. */
const COLLECTABLE_ORDER = [OrderStatus.ACCEPTED, OrderStatus.PREPARING, OrderStatus.READY]

function cents(value: number): number {
  return Math.round(value * 100) / 100
}

function shipmentNotFound() {
  return terroirError(HttpStatus.NOT_FOUND, 'EXPORT_SHIPMENT_NOT_FOUND', 'Colis introuvable.')
}

function wrongState(message: string) {
  return terroirError(HttpStatus.CONFLICT, 'EXPORT_SHIPMENT_STATE', message)
}

function invalidStep(message: string) {
  return terroirError(HttpStatus.BAD_REQUEST, 'EXPORT_STEP_INVALID', message)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** What a parcel loses when a line or an order leaves it, and what goes back to the buyer. */
interface Shrinkage {
  shipment: ExportShipment
  shippingRefund: number
  insuranceRefund: number
}

/**
 * Terroir parcels (011): as their buyer and a gift's recipient follow them
 * (contracts §3), and as eBio handles them in the back office (§5),
 * collection from each shop, missing products, weighing, steps, hand-over,
 * loss.
 *
 * Money rule: the shops are paid at collection and never debited afterwards;
 * whatever the buyer gets back after that is eBio's, on the EXPORT account.
 */
@Injectable()
export class ExportShipmentsService implements OnModuleInit {
  constructor(
    private readonly em: EntityManager,
    private readonly platformSettings: PlatformSettingsService,
    private readonly orders: OrdersService,
    private readonly wallets: WalletService,
    private readonly logistics: ExportLogisticsService,
    private readonly notifier: TerroirNotifierService,
    private readonly audit: AuditService,
  ) {}

  /** A shop refusing (or an admin cancelling) an EXPORT order shrinks its parcel. */
  onModuleInit(): void {
    this.orders.onExportOrderCancelled(orderId => this.onOrderCancelled(orderId))
  }

  // ===== BUYER =====

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
      { populate: ['checkout', 'departure', 'departure.agency', 'pickupPoint'], refresh: true },
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

  // ===== BACK OFFICE, READING =====

  async adminDetail(shipmentId: string): Promise<AdminShipmentView> {
    const shipment = await this.em.findOne(
      ExportShipment,
      { id: shipmentId },
      { populate: ['buyer', 'checkout', 'departure', 'departure.agency', 'pickupPoint'], refresh: true },
    )
    if (!shipment) {
      throw shipmentNotFound()
    }
    const orders = await this.em.find(
      Order,
      { checkout: shipment.checkout.id },
      { populate: ['supplier', 'items', 'items.product', 'items.variant'], orderBy: { createdAt: 'ASC' }, refresh: true },
    )
    const events = await this.em.find(ExportShipmentEvent, { shipment: shipment.id }, { populate: ['author'], orderBy: { createdAt: 'ASC' } })
    return { shipment, orders, events }
  }

  /**
   * The departure's printable list for the agency (FR-021): one block per
   * parcel, recipient, city, contents, quantities, declared value in euros,
   * weight.
   */
  async manifestHtml(departureId: string): Promise<string> {
    const departure = await this.em.findOne(ExportDeparture, { id: departureId }, { populate: ['agency'] })
    if (!departure) {
      throw terroirError(HttpStatus.NOT_FOUND, 'EXPORT_DEPARTURE_NOT_FOUND', 'Départ introuvable.')
    }
    const shipments = await this.em.find(
      ExportShipment,
      { departure: departureId, status: { $nin: UNTRACKED } },
      { populate: ['buyer', 'checkout', 'pickupPoint'], orderBy: { createdAt: 'ASC' } },
    )
    const orders = shipments.length === 0
      ? []
      : await this.em.find(
          Order,
          { checkout: { $in: shipments.map(shipment => shipment.checkout.id) }, status: { $ne: OrderStatus.CANCELLED } },
          { populate: ['items', 'items.product', 'items.variant'], orderBy: { createdAt: 'ASC' } },
        )

    const countryCodes = [...new Set(shipments.map(shipment => shipment.country))]
    const countries = countryCodes.length === 0 ? [] : await this.em.find(ExportCountry, { code: { $in: countryCodes } })
    const countryName = new Map(countries.map(country => [country.code, country.name]))

    let totalWeightG = 0
    let totalEur = 0
    const blocks = shipments.map((shipment, index) => {
      const removed = new Set(shipment.removedItemIds)
      const lines = orders
        .filter(order => order.checkout?.id === shipment.checkout.id)
        .flatMap(order => order.items.getItems().filter(item => !removed.has(item.id)))
      const weightG = shipment.actualWeightG ?? shipment.estimatedWeightG
      const eur = Math.round(Number(shipment.declaredValue) / XOF_PER_EUR * 100) / 100
      totalWeightG += weightG
      totalEur += eur
      const recipient = shipment.giftRecipientName ?? shipment.buyer.name ?? 'Client'
      const phone = shipment.giftRecipientName ? shipment.giftRecipientPhone : shipment.buyer.phone
      const destination = shipment.reception === ExportReception.HOME
        ? `Domicile : ${shipment.homeAddress ?? ''}`
        : `${shipment.pickupPoint?.city ?? ''}, retrait ${shipment.pickupPoint?.address ?? ''}`
      const rows = lines.map(item => `<tr><td>${escapeHtml(item.variant ? `${item.product.name}, ${item.variant.label}` : item.product.name)}</td><td class="num">${item.quantity}</td></tr>`).join('')
      return `<section>
        <h2>Colis ${index + 1} · ${escapeHtml(shipment.id.slice(0, 8).toUpperCase())}${shipment.insured ? ' · assuré' : ''}</h2>
        <p><strong>${escapeHtml(recipient)}</strong>${phone ? ` · ${escapeHtml(phone)}` : ''}<br>${escapeHtml(countryName.get(shipment.country) ?? shipment.country)} · ${escapeHtml(destination)}</p>
        <table><thead><tr><th>Contenu</th><th class="num">Qté</th></tr></thead><tbody>${rows}</tbody></table>
        <p>Valeur déclarée : <strong>${eur.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</strong> · Poids : <strong>${(weightG / 1000).toLocaleString('fr-FR')} kg</strong>${shipment.actualWeightG == null ? ' (estimé)' : ''}</p>
      </section>`
    })

    return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Liste du départ du ${escapeHtml(spokenDay(departure.departsOn))}</title>
<style>
  body { font-family: Arial, sans-serif; color: #2A2924; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 15px; margin: 0 0 6px; }
  section { border: 1px solid #ccc; border-radius: 6px; padding: 10px 12px; margin: 12px 0; page-break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; } th, td { text-align: left; padding: 3px 4px; border-bottom: 1px solid #eee; }
  .num { text-align: right; width: 60px; } p { margin: 6px 0; font-size: 13px; }
  @media print { body { margin: 0; } }
</style></head><body>
<h1>${escapeHtml(departure.agency.name)}, départ du ${escapeHtml(spokenDay(departure.departsOn))}</h1>
<p>${shipments.length} colis · ${(totalWeightG / 1000).toLocaleString('fr-FR')} kg · valeur déclarée ${totalEur.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € · droits et taxes inclus</p>
${blocks.join('\n')}
</body></html>`
  }

  // ===== BACK OFFICE, COLLECTION =====

  /**
   * eBio collected a shop's products for this parcel (T037): the shop's
   * order is DELIVERED at the time of collection and its escrow released at
   * once, the shop credited its own order only. The parcel moves to
   * COLLECTING, then PACKED once every shop is collected.
   */
  async collect(shipmentId: string, supplierId: string, actorUserId: string): Promise<AdminShipmentView> {
    const shipment = await this.load(shipmentId)
    if (!AT_EBIO.includes(shipment.status)) {
      throw wrongState('Ce colis n\'est plus en préparation chez eBio.')
    }
    const orders = await this.em.find(Order, { checkout: shipment.checkout.id, supplier: supplierId, status: { $ne: OrderStatus.CANCELLED } }, { refresh: true })
    if (orders.length === 0) {
      throw terroirError(HttpStatus.NOT_FOUND, 'EXPORT_SHOP_NOT_IN_SHIPMENT', 'Cette boutique n\'a pas de produit dans ce colis.')
    }
    const pending = orders.filter(order => order.status !== OrderStatus.DELIVERED)
    if (pending.some(order => !COLLECTABLE_ORDER.includes(order.status))) {
      throw terroirError(HttpStatus.CONFLICT, 'EXPORT_ORDER_NOT_ACCEPTED', 'La boutique n\'a pas encore accepté cette commande.')
    }
    for (const order of pending) {
      // Silent: the buyer follows the parcel, never « commande livrée ».
      await this.orders.adminUpdateStatus(order.id, OrderStatus.DELIVERED, { silent: true })
    }
    await this.audit.record({
      actorUserId,
      action: 'EXPORT_SHIPMENT_COLLECTED',
      targetType: 'export_shipment',
      targetId: shipmentId,
      payload: { supplierId, orderIds: pending.map(order => order.id) },
    })
    await this.advanceCollection(shipmentId, actorUserId)
    return this.adminDetail(shipmentId)
  }

  /**
   * A product missing at collection (T038, FR-022): out of the parcel, the
   * buyer refunded of it and of the shipping the lighter parcel no longer
   * costs; the parcel goes on. The order's last line cancels the order
   * itself, the ordinary cancellation refunds it and shrinks the parcel.
   */
  async missing(shipmentId: string, orderItemId: string, actorUserId: string): Promise<AdminShipmentView> {
    const shipment = await this.load(shipmentId)
    if (!AT_EBIO.includes(shipment.status)) {
      throw wrongState('Ce colis a quitté eBio : un produit ne peut plus en être retiré.')
    }
    const item = await this.lineOf(shipment, orderItemId)
    await this.removeLine(shipment, item, `${item.product.name} manquant à la collecte : retiré du colis et remboursé.`, 'estimate', actorUserId)
    await this.audit.record({
      actorUserId,
      action: 'EXPORT_ITEM_MISSING',
      targetType: 'export_shipment',
      targetId: shipmentId,
      payload: { orderItemId, orderId: item.order.id, productId: item.product.id, quantity: item.quantity },
    })
    await this.advanceCollection(shipmentId, actorUserId)
    return this.adminDetail(shipmentId)
  }

  /** An order line of this parcel, still in it. */
  async lineOf(shipment: ExportShipment, orderItemId: string): Promise<OrderItem> {
    const item = await this.em.findOne(
      OrderItem,
      { id: orderItemId, order: { checkout: shipment.checkout.id } },
      { populate: ['order', 'order.items', 'product', 'variant'], refresh: true },
    )
    if (!item || item.order.status === OrderStatus.CANCELLED || shipment.removedItemIds.includes(item.id)) {
      throw terroirError(HttpStatus.NOT_FOUND, 'EXPORT_LINE_NOT_FOUND', 'Ce produit n\'est pas dans le colis.')
    }
    return item
  }

  /**
   * Takes one line out of the parcel and refunds it. Before collection the
   * shop is simply not paid for it (the escrowed amount shrinks); after,
   * the shop keeps its sale and eBio refunds the buyer from EXPORT. The
   * shipping and insurance the lighter parcel no longer costs come back too.
   * `basis`: `estimate` (missing at collection: the parcel paid for gets
   * lighter) or `actual` (removed after weighing: the weighed parcel does).
   */
  async removeLine(shipment: ExportShipment, item: OrderItem, eventMessage: string, basis: 'estimate' | 'actual', actorUserId: string | null): Promise<void> {
    const order = item.order
    const items = order.items.getItems()
    const itemsSum = items.reduce((total, line) => total + Number(line.totalPrice), 0)
    const value = itemsSum > 0 ? cents(Number(order.totalAmount) * Number(item.totalPrice) / itemsSum) : 0
    const weightG = await this.weightOf([item])
    const reference = shipment.id.slice(0, 8)

    if (order.status !== OrderStatus.DELIVERED) {
      const live = items.filter(line => !shipment.removedItemIds.includes(line.id))
      if (live.length <= 1) {
        // The order's last line: cancelling the order refunds it, and its
        // listener (onExportOrderCancelled) shrinks or closes the parcel.
        await this.orders.adminUpdateStatus(order.id, OrderStatus.CANCELLED, { silent: true })
        await this.addSystemEvent(shipment.id, eventMessage, actorUserId)
        return
      }
      const payment = await this.em.findOne(Payment, { order: order.id, status: { $in: [PaymentStatus.CAPTURED, PaymentStatus.ESCROW] } })
      if (!payment) {
        throw wrongState('Le paiement de cette commande n\'est pas en séquestre.')
      }
      const before = Number(order.totalAmount)
      const after = Math.max(0, cents(before - value))
      order.commissionAmount = before > 0 ? cents(Number(order.commissionAmount) * after / before) : 0
      order.totalAmount = after
      payment.amount = Math.max(0, cents(Number(payment.amount) - value))
      this.em.remove(item)
      await this.em.flush()
      await this.refundBuyer(shipment.buyer.id, value, `Remboursement, ${item.product.name}, retiré de la valise ${reference}`, payment.id)
    }
    else {
      // Collected, so the shop was paid: the line stays its sale; eBio refunds.
      await this.refundBuyer(shipment.buyer.id, value, `Remboursement, ${item.product.name}, retiré de la valise ${reference}`)
      await this.wallets.post(PlatformAccount.EXPORT, 'debit', {
        type: WalletTransactionType.EXPORT_LOSS,
        amount: value,
        description: `Produit retiré après collecte, ${item.product.name}, colis ${reference}`,
        orderId: order.id,
      })
    }

    const shrunk = await this.shrink(shipment.id, { value, weightG, basis, markItemId: order.status === OrderStatus.DELIVERED ? item.id : undefined })
    if (shrunk) {
      await this.payShrinkage(shrunk)
    }
    await this.addSystemEvent(shipment.id, eventMessage, actorUserId)
  }

  /**
   * An EXPORT order cancelled (the shop refused it, an admin cancelled it):
   * its products were refunded by the cancellation; the parcel loses its
   * weight, the matching shipping and insurance go back to the buyer, and a
   * parcel left with no order is cancelled, everything refunded. Replays
   * change nothing.
   */
  async onOrderCancelled(orderId: string): Promise<void> {
    const order = await this.em.findOne(Order, { id: orderId }, { populate: ['checkout', 'supplier', 'items', 'items.product', 'items.variant'], refresh: true })
    if (!order?.checkout) {
      return
    }
    const shipment = await this.em.findOne(ExportShipment, { checkout: order.checkout.id }, { refresh: true })
    if (!shipment || !AT_EBIO.includes(shipment.status) || shipment.removedOrderIds.includes(order.id)) {
      return
    }
    const removed = new Set(shipment.removedItemIds)
    const weightG = await this.weightOf(order.items.getItems().filter(item => !removed.has(item.id)))
    const shrunk = await this.shrink(shipment.id, { value: Number(order.totalAmount), weightG, basis: 'estimate', markOrderId: order.id })
    if (!shrunk) {
      return
    }
    const left = await this.em.count(Order, { checkout: order.checkout.id, status: { $ne: OrderStatus.CANCELLED } })
    if (left === 0) {
      await this.closeEmpty(shrunk)
      return
    }
    await this.payShrinkage(shrunk)
    const refunded = cents(shrunk.shippingRefund + shrunk.insuranceRefund)
    await this.addSystemEvent(
      shipment.id,
      `La commande de ${order.supplier.shopName} est annulée : ses produits sont remboursés${refunded > 0 ? `, ainsi que ${refunded.toLocaleString('fr-FR')} FCFA de transport` : ''}. Le reste du colis part comme prévu.`,
      null,
    )
    await this.advanceCollection(shipment.id, null)
  }

  // ===== BACK OFFICE, WEIGHING =====

  /**
   * The real weight (T039, FR-020). Within the tolerance eBio absorbs the
   * gap; beyond, a supplement is asked of the buyer, who pays it or removes
   * a product within 48 h, else eBio absorbs it (TerroirScheduler).
   */
  async weigh(shipmentId: string, actualWeightG: number, actorUserId: string): Promise<AdminShipmentView> {
    const shipment = await this.load(shipmentId)
    if (!AT_EBIO.includes(shipment.status)) {
      throw wrongState('Ce colis a quitté eBio : il ne peut plus être pesé.')
    }
    if (shipment.supplementStatus === ExportSupplementStatus.PAID || shipment.supplementStatus === ExportSupplementStatus.WAIVED) {
      throw terroirError(HttpStatus.CONFLICT, 'EXPORT_SUPPLEMENT_SETTLED', 'Le complément de ce colis est déjà réglé : il ne peut plus être repesé.')
    }
    const { weightTolerancePct } = await this.platformSettings.getTerroirExportSettings()
    const amount = supplementFor(shipment.estimatedWeightG, actualWeightG, this.rateOf(shipment), weightTolerancePct)
    const previous = shipment.supplementStatus === ExportSupplementStatus.REQUESTED ? Number(shipment.supplementAmount) : null

    shipment.actualWeightG = actualWeightG
    if (amount !== null) {
      shipment.supplementStatus = ExportSupplementStatus.REQUESTED
      shipment.supplementAmount = String(amount)
      shipment.supplementRequestedAt = previous === null ? new Date() : shipment.supplementRequestedAt
    }
    else if (shipment.supplementStatus === ExportSupplementStatus.REQUESTED) {
      shipment.supplementStatus = ExportSupplementStatus.NONE
      shipment.supplementAmount = null
      shipment.supplementRequestedAt = null
      shipment.supplementTopupId = null
    }
    await this.em.flush()

    await this.audit.record({
      actorUserId,
      action: 'EXPORT_SHIPMENT_WEIGHED',
      targetType: 'export_shipment',
      targetId: shipmentId,
      payload: { estimatedWeightG: shipment.estimatedWeightG, actualWeightG, supplement: amount },
    })
    if (amount !== null && amount !== previous) {
      await this.notifier.supplementRequested({
        shipmentId,
        amount,
        estimatedG: shipment.estimatedWeightG,
        actualG: actualWeightG,
        deadline: new Date(shipment.supplementRequestedAt!.getTime() + SUPPLEMENT_WINDOW_HOURS * HOUR_MS),
      })
    }
    await this.logistics.refreshFill(shipment.departure.id)
    return this.adminDetail(shipmentId)
  }

  // ===== BACK OFFICE, TRACKING =====

  /** A step and / or a free message on one parcel (T041, FR-024–FR-026). */
  async addEvent(shipmentId: string, input: ExportShipmentEventInput, actorUserId: string): Promise<AdminShipmentView> {
    const shipment = await this.em.findOne(ExportShipment, { id: shipmentId }, { populate: ['pickupPoint'], refresh: true })
    if (!shipment) {
      throw shipmentNotFound()
    }
    if (shipment.status === ExportShipmentStatus.PENDING_PAYMENT) {
      throw wrongState('Ce colis n\'est pas encore payé.')
    }
    const step = input.step ?? null
    if (step) {
      this.assertStep(step)
      if (SETTLED.includes(shipment.status)) {
        throw wrongState('Ce colis est clos : seul un message peut encore y être ajouté.')
      }
      this.assertReception(shipment, step)
    }
    const news = this.applyEvent(shipment, step, input.message ?? null, input.pickupPoint ?? null, actorUserId)
    await this.em.flush()
    await this.audit.record({ actorUserId, action: 'EXPORT_SHIPMENT_EVENT', targetType: 'export_shipment', targetId: shipmentId, payload: { step, message: input.message ?? null } })
    await this.notifier.shipmentNews(news)
    return this.adminDetail(shipmentId)
  }

  /**
   * One step for every parcel of a departure in one request (FR-024, SC-005).
   * Closed parcels, and those whose reception does not fit the step (no
   * « disponible au retrait » for a door delivery), are left as they are.
   * DEPARTED also marks the departure itself as gone.
   */
  async addDepartureEvent(departureId: string, input: ExportDepartureEventInput, actorUserId: string): Promise<{ applied: number }> {
    this.assertStep(input.step)
    const departure = await this.em.findOne(ExportDeparture, { id: departureId })
    if (!departure) {
      throw terroirError(HttpStatus.NOT_FOUND, 'EXPORT_DEPARTURE_NOT_FOUND', 'Départ introuvable.')
    }
    const shipments = await this.em.find(
      ExportShipment,
      { departure: departureId, status: { $nin: [...SETTLED, ExportShipmentStatus.PENDING_PAYMENT] } },
      { populate: ['pickupPoint'], refresh: true },
    )
    const news: ShipmentNews[] = []
    for (const shipment of shipments) {
      if (!this.fitsReception(shipment, input.step)) {
        continue
      }
      news.push(this.applyEvent(shipment, input.step, input.message ?? null, null, actorUserId))
    }
    if (input.step === ExportShipmentStatus.DEPARTED && departure.status !== ExportDepartureStatus.CANCELLED) {
      departure.status = ExportDepartureStatus.DEPARTED
    }
    await this.em.flush()
    await this.audit.record({
      actorUserId,
      action: 'EXPORT_DEPARTURE_EVENT',
      targetType: 'export_departure',
      targetId: departureId,
      payload: { step: input.step, message: input.message ?? null, parcels: news.length },
    })
    for (const item of news) {
      await this.notifier.shipmentNews(item)
    }
    return { applied: news.length }
  }

  /** The parcel reached its recipient (US5); a gift's payer is told (FR-036). */
  async handedOver(shipmentId: string, actorUserId: string): Promise<AdminShipmentView> {
    const shipment = await this.load(shipmentId)
    if (SETTLED.includes(shipment.status) || [...AT_EBIO, ExportShipmentStatus.PENDING_PAYMENT].includes(shipment.status)) {
      throw wrongState('Ce colis n\'est pas en route : il ne peut pas être remis.')
    }
    const news = this.applyEvent(shipment, ExportShipmentStatus.HANDED_OVER, null, null, actorUserId)
    await this.em.flush()
    await this.audit.record({ actorUserId, action: 'EXPORT_SHIPMENT_HANDED_OVER', targetType: 'export_shipment', targetId: shipmentId, payload: {} })
    await this.notifier.shipmentNews(news)
    return this.adminDetail(shipmentId)
  }

  /**
   * A parcel lost or damaged (FR-028, FR-030): refunded without any return,
   * the products and the shipping; an insured parcel in full, door delivery
   * included. The shops, paid at collection, are not debited: the EXPORT
   * account carries the loss, the insurance collected (booked apart as
   * EXPORT_INSURANCE_INCOME) covering it over time.
   */
  async lost(shipmentId: string, damaged: boolean, actorUserId: string): Promise<AdminShipmentView> {
    const shipment = await this.load(shipmentId)
    if (!LOSABLE.includes(shipment.status)) {
      throw wrongState('Seul un colis emballé et pas encore remis peut être déclaré perdu ou abîmé.')
    }
    const step = damaged ? ExportShipmentStatus.DAMAGED : ExportShipmentStatus.LOST
    // Conditional: two agents clicking at once refund once.
    const rows = await this.em.getConnection().execute(
      `UPDATE export_shipments SET status = ?, updated_at = NOW() WHERE id = ? AND status IN (${LOSABLE.map(() => '?').join(', ')}) RETURNING id`,
      [step, shipmentId, ...LOSABLE],
    ) as Array<{ id: string }>
    if (rows.length === 0) {
      throw wrongState('Ce colis vient d\'être clos.')
    }
    const products = Number(shipment.declaredValue)
    const supplement = shipment.supplementStatus === ExportSupplementStatus.PAID ? Number(shipment.supplementAmount ?? 0) : 0
    const shipping = Number(shipment.shippingPrice) + supplement
    const home = shipment.insured ? Number(shipment.homeDeliveryFee) : 0
    const refund = cents(products + shipping + home)
    const reference = shipment.id.slice(0, 8)
    const what = damaged ? 'abîmé' : 'perdu'

    await this.refundBuyer(shipment.buyer.id, refund, `Remboursement, valise ${reference} ${what}`)
    await this.wallets.post(PlatformAccount.EXPORT, 'debit', {
      type: WalletTransactionType.EXPORT_LOSS,
      amount: refund,
      description: shipment.insured
        ? `Colis assuré ${what}, ${reference} (assurance encaissée : ${Number(shipment.insurancePrice).toLocaleString('fr-FR')} FCFA)`
        : `Colis ${what}, ${reference}`,
    })
    this.em.create(ExportShipmentEvent, {
      shipment: this.em.getReference(ExportShipment, shipmentId),
      step,
      message: null,
      author: this.em.getReference(User, actorUserId),
    })
    await this.em.flush()
    await this.audit.record({
      actorUserId,
      action: damaged ? 'EXPORT_SHIPMENT_DAMAGED' : 'EXPORT_SHIPMENT_LOST',
      targetType: 'export_shipment',
      targetId: shipmentId,
      payload: { refund, products, shipping, home, insured: shipment.insured, insurancePrice: Number(shipment.insurancePrice) },
    })
    await this.notifier.shipmentNews({ shipmentId, step, message: null, pickupPoint: null, refunded: refund })
    return this.adminDetail(shipmentId)
  }

  // ===== INTERNALS =====

  /** Weight of order lines from their export profiles, packaging excluded. */
  async weightOf(items: OrderItem[]): Promise<number> {
    if (items.length === 0) {
      return 0
    }
    const profiles = await this.em.find(ExportProfile, { product: { $in: [...new Set(items.map(item => item.product.id))] } })
    const byProduct = new Map(profiles.map(profile => [profile.product.id, profile]))
    return items.reduce((total, item) => {
      const profile = byProduct.get(item.product.id)
      return total + (profile ? lineWeight(profile, item.variant ?? null, item.quantity) : 0)
    }, 0)
  }

  /** The buyer's personal wallet: terroir is never paid by a family wallet (v1). */
  async refundBuyer(buyerId: string, amount: number, description: string, paymentId?: string): Promise<void> {
    if (!(amount > 0)) {
      return
    }
    const wallet = await this.wallets.getOrCreate({ userId: buyerId })
    // No `orderId`: a REFUND carrying one would read as the whole order refunded.
    await this.wallets.credit(wallet.id, { type: WalletTransactionType.REFUND, amount, description, paymentId })
  }

  rateOf(shipment: ExportShipment): { pricePerKg: number, minBilledKg: number } {
    return { pricePerKg: Number(shipment.pricePerKg), minBilledKg: Number(shipment.minBilledKg) }
  }

  /**
   * Takes `value` and `weightG` off the parcel under a row lock and reprices
   * its shipping (frozen rate) and insurance. Returns null when the mark is
   * already there, a replay. Money moves after, in payShrinkage.
   */
  async shrink(shipmentId: string, input: { value: number, weightG: number, basis: 'estimate' | 'actual', markItemId?: string, markOrderId?: string }): Promise<Shrinkage | null> {
    const settings = await this.platformSettings.getTerroirExportSettings()
    const result = await this.em.transactional(async (em) => {
      await em.execute(`SELECT id FROM export_shipments WHERE id = ? FOR UPDATE`, [shipmentId])
      const shipment = await em.findOneOrFail(ExportShipment, { id: shipmentId }, { refresh: true })
      if ((input.markItemId && shipment.removedItemIds.includes(input.markItemId))
        || (input.markOrderId && shipment.removedOrderIds.includes(input.markOrderId))) {
        return null
      }
      const rate = this.rateOf(shipment)
      const oldShipping = Number(shipment.shippingPrice)
      const oldInsurance = Number(shipment.insurancePrice)
      const declared = Math.max(0, cents(Number(shipment.declaredValue) - input.value))

      if (input.basis === 'estimate') {
        shipment.estimatedWeightG = Math.max(0, shipment.estimatedWeightG - input.weightG)
        if (shipment.actualWeightG != null) {
          shipment.actualWeightG = Math.max(0, shipment.actualWeightG - input.weightG)
        }
      }
      else if (shipment.actualWeightG != null) {
        shipment.actualWeightG = Math.max(0, shipment.actualWeightG - input.weightG)
        // Lighter than what was paid for: the buyer pays for the parcel that leaves.
        shipment.estimatedWeightG = Math.min(shipment.estimatedWeightG, shipment.actualWeightG)
      }
      const newShipping = Math.min(oldShipping, shippingPrice(shipment.estimatedWeightG, rate))
      const newInsurance = shipment.insured ? Math.min(oldInsurance, insurancePrice(declared, settings.insuranceRateBps, settings.insuranceMin)) : oldInsurance

      shipment.declaredValue = String(declared)
      shipment.shippingPrice = String(newShipping)
      shipment.insurancePrice = String(newInsurance)
      if (input.markItemId) {
        shipment.removedItemIds = [...shipment.removedItemIds, input.markItemId]
      }
      if (input.markOrderId) {
        shipment.removedOrderIds = [...shipment.removedOrderIds, input.markOrderId]
      }
      await em.flush()
      return { shipmentId, shippingRefund: cents(oldShipping - newShipping), insuranceRefund: cents(oldInsurance - newInsurance) }
    })
    if (!result) {
      return null
    }
    const shipment = await this.em.findOneOrFail(ExportShipment, { id: shipmentId }, { refresh: true })
    return { shipment, shippingRefund: result.shippingRefund, insuranceRefund: result.insuranceRefund }
  }

  /** What a shrunk parcel gives back: to the buyer, out of the EXPORT account's income. */
  async payShrinkage(shrunk: Shrinkage): Promise<void> {
    const { shipment, shippingRefund, insuranceRefund } = shrunk
    const reference = shipment.id.slice(0, 8)
    await this.refundBuyer(shipment.buyer.id, cents(shippingRefund + insuranceRefund), `Remboursement, transport de la valise ${reference} allégé`)
    await this.wallets.post(PlatformAccount.EXPORT, 'debit', {
      type: WalletTransactionType.EXPORT_SHIPPING_INCOME,
      amount: shippingRefund,
      description: `Transport remboursé, colis ${reference} allégé`,
    })
    await this.wallets.post(PlatformAccount.EXPORT, 'debit', {
      type: WalletTransactionType.EXPORT_INSURANCE_INCOME,
      amount: insuranceRefund,
      description: `Assurance remboursée, colis ${reference} allégé`,
    })
    await this.logistics.refreshFill(shipment.departure.id)
  }

  /**
   * No order left in the parcel: it is cancelled and everything not yet
   * refunded comes back, shipping, door delivery, insurance, a paid
   * supplement, an eBio pack's margin.
   */
  private async closeEmpty(shrunk: Shrinkage): Promise<void> {
    const { shipment } = shrunk
    const rows = await this.em.getConnection().execute(
      `UPDATE export_shipments SET status = ?, updated_at = NOW() WHERE id = ? AND status IN (${AT_EBIO.map(() => '?').join(', ')}) RETURNING id`,
      [ExportShipmentStatus.CANCELLED, shipment.id, ...AT_EBIO],
    ) as Array<{ id: string }>
    if (rows.length === 0) {
      return
    }
    const reference = shipment.id.slice(0, 8)
    const supplement = shipment.supplementStatus === ExportSupplementStatus.PAID ? Number(shipment.supplementAmount ?? 0) : 0
    const shipping = cents(Number(shipment.shippingPrice) + Number(shipment.homeDeliveryFee) + supplement + shrunk.shippingRefund)
    const insurance = cents(Number(shipment.insurancePrice) + shrunk.insuranceRefund)
    const residual = Math.max(0, Number(shipment.declaredValue))
    const refund = cents(shipping + insurance + residual)

    await this.refundBuyer(shipment.buyer.id, refund, `Remboursement, valise ${reference} annulée`)
    await this.wallets.post(PlatformAccount.EXPORT, 'debit', { type: WalletTransactionType.EXPORT_SHIPPING_INCOME, amount: shipping, description: `Transport remboursé, colis ${reference} annulé` })
    await this.wallets.post(PlatformAccount.EXPORT, 'debit', { type: WalletTransactionType.EXPORT_INSURANCE_INCOME, amount: insurance, description: `Assurance remboursée, colis ${reference} annulé` })
    await this.wallets.post(PlatformAccount.EXPORT, 'debit', { type: WalletTransactionType.EXPORT_PACK_COMPENSATION, amount: residual, description: `Marge pack eBio remboursée, colis ${reference} annulé` })
    if (residual > 0) {
      await this.em.getConnection().execute(`UPDATE export_shipments SET declared_value = 0 WHERE id = ?`, [shipment.id])
    }
    const em = this.em.fork()
    em.create(ExportShipmentEvent, { shipment: em.getReference(ExportShipment, shipment.id), step: ExportShipmentStatus.CANCELLED, message: null, author: null })
    await em.flush()
    await this.logistics.refreshFill(shipment.departure.id)
    await this.notifier.shipmentNews({ shipmentId: shipment.id, step: ExportShipmentStatus.CANCELLED, message: null, pickupPoint: null, refunded: refund })
  }

  /** PAID → COLLECTING at the first shop collected; → PACKED once every live order is. */
  private async advanceCollection(shipmentId: string, actorUserId: string | null): Promise<void> {
    const shipment = await this.em.findOneOrFail(ExportShipment, { id: shipmentId }, { populate: ['pickupPoint'], refresh: true })
    if (shipment.status !== ExportShipmentStatus.PAID && shipment.status !== ExportShipmentStatus.COLLECTING) {
      return
    }
    const orders = await this.em.find(Order, { checkout: shipment.checkout.id, status: { $ne: OrderStatus.CANCELLED } }, { refresh: true })
    if (orders.length === 0) {
      return
    }
    const collected = orders.filter(order => order.status === OrderStatus.DELIVERED).length
    const steps: ExportShipmentStatus[] = []
    if (shipment.status === ExportShipmentStatus.PAID && collected > 0) {
      steps.push(ExportShipmentStatus.COLLECTING)
    }
    if (collected === orders.length) {
      steps.push(ExportShipmentStatus.PACKED)
    }
    const news = steps.map(step => this.applyEvent(shipment, step, null, null, actorUserId))
    await this.em.flush()
    for (const item of news) {
      await this.notifier.shipmentNews(item)
    }
  }

  /** Writes the event and moves the parcel's current step; the caller flushes and notifies. */
  private applyEvent(shipment: ExportShipment, step: ExportShipmentStatus | null, message: string | null, pickupPoint: string | null, actorUserId: string | null): ShipmentNews {
    const snapshot = pickupPoint
      ?? (step === ExportShipmentStatus.READY_FOR_PICKUP && shipment.pickupPoint
        ? [shipment.pickupPoint.address, shipment.pickupPoint.openingHours].filter(Boolean).join(', ')
        : null)
    if (step) {
      shipment.status = step
      if (step === ExportShipmentStatus.READY_FOR_PICKUP) {
        shipment.pickupRemindedAt = null
      }
    }
    this.em.create(ExportShipmentEvent, {
      shipment,
      step,
      message,
      pickupPointSnapshot: snapshot,
      author: actorUserId ? this.em.getReference(User, actorUserId) : null,
    })
    return { shipmentId: shipment.id, step, message, pickupPoint: snapshot }
  }

  private async addSystemEvent(shipmentId: string, message: string, actorUserId: string | null): Promise<void> {
    const em = this.em.fork()
    em.create(ExportShipmentEvent, {
      shipment: em.getReference(ExportShipment, shipmentId),
      step: null,
      message,
      author: actorUserId ? em.getReference(User, actorUserId) : null,
    })
    await em.flush()
    await this.notifier.shipmentNews({ shipmentId, step: null, message, pickupPoint: null })
  }

  private assertStep(step: ExportShipmentStatus): void {
    if (RESERVED_STEPS.includes(step)) {
      throw invalidStep('Cette étape a son action dédiée (remise, perte, annulation).')
    }
  }

  private assertReception(shipment: ExportShipment, step: ExportShipmentStatus): void {
    if (!this.fitsReception(shipment, step)) {
      throw invalidStep(step === ExportShipmentStatus.OUT_FOR_DELIVERY
        ? 'Ce colis est à retirer en point de retrait : il n\'est pas livré à domicile.'
        : 'Ce colis est livré à domicile : il n\'a pas de point de retrait.')
    }
  }

  private fitsReception(shipment: ExportShipment, step: ExportShipmentStatus): boolean {
    if (step === ExportShipmentStatus.OUT_FOR_DELIVERY) {
      return shipment.reception === ExportReception.HOME
    }
    if (step === ExportShipmentStatus.READY_FOR_PICKUP) {
      return shipment.reception === ExportReception.PICKUP
    }
    return true
  }

  private async load(shipmentId: string): Promise<ExportShipment> {
    const shipment = await this.em.findOne(ExportShipment, { id: shipmentId }, { populate: ['checkout', 'departure', 'pickupPoint'], refresh: true })
    if (!shipment) {
      throw shipmentNotFound()
    }
    return shipment
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
      { populate: ['supplier', 'items', 'items.product', 'items.variant'], orderBy: { createdAt: 'ASC' }, refresh: true },
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
