import type { OnModuleInit } from '@nestjs/common'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { Order } from '../orders/entities/order.entity'
import { PaymentsService } from '../payments/payments.service'
import { WalletTransactionType } from '../wallet/entities/wallet-transaction.entity'
import { PlatformAccount } from '../wallet/entities/wallet.entity'
import { WalletService } from '../wallet/wallet.service'
import { ExportShipmentStatus } from './contracts/terroir.contract'
import { ExportShipmentEvent } from './entities/export-shipment-event.entity'
import { ExportShipment } from './entities/export-shipment.entity'
import { ExportLogisticsService } from './export-logistics.service'
import { TerroirNotifierService } from './terroir-notifier.service'

function cents(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * What a paid terroir parcel settles (011, T027): the parcel becomes PAID,
 * eBio's EXPORT account takes the shipping, the home delivery, the insurance
 * and an eBio pack's margin (or pays its compensation), the departure's fill
 * is refreshed and the buyer is told.
 *
 * The shops' money never passes here: each order is escrowed its own total,
 * released at collection like any order.
 */
@Injectable()
export class TerroirSettlementService implements OnModuleInit {
  private readonly logger = new Logger(TerroirSettlementService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly payments: PaymentsService,
    private readonly wallets: WalletService,
    private readonly logistics: ExportLogisticsService,
    private readonly notifier: TerroirNotifierService,
  ) {}

  /** The card path: PaymentsService tells us of every confirmed checkout. */
  onModuleInit(): void {
    this.payments.onCheckoutPaid(checkoutId => this.onCardPaid(checkoutId))
  }

  /**
   * A card checkout confirmed (app verification or reconciliation). The
   * conditional update makes replays harmless: only the first one settles.
   */
  async onCardPaid(checkoutId: string): Promise<void> {
    const rows = await this.em.getConnection().execute(
      `UPDATE export_shipments SET status = ?, updated_at = NOW()
       WHERE checkout_id = ? AND status = ? RETURNING id`,
      [ExportShipmentStatus.PAID, checkoutId, ExportShipmentStatus.PENDING_PAYMENT],
    ) as Array<{ id: string }>
    if (rows.length === 0) {
      return
    }
    const shipmentId = rows[0].id
    const em = this.em.fork()
    em.create(ExportShipmentEvent, { shipment: em.getReference(ExportShipment, shipmentId), step: ExportShipmentStatus.PAID, message: null, author: null })
    await em.flush()
    await this.postPaid(shipmentId)
  }

  /** eBio's books, the departure's fill and the buyer's notification, once the parcel is PAID. */
  async postPaid(shipmentId: string): Promise<void> {
    const em = this.em.fork()
    const shipment = await em.findOneOrFail(ExportShipment, { id: shipmentId }, { populate: ['checkout', 'departure'] })
    const orders = await em.find(Order, { checkout: shipment.checkout.id })
    const ordersTotal = orders.reduce((total, order) => total + Number(order.totalAmount), 0)
    const shipping = Number(shipment.shippingPrice)
    const home = Number(shipment.homeDeliveryFee)
    const insurance = Number(shipment.insurancePrice)
    const packDelta = cents(Number(shipment.checkout.totalAmount) - ordersTotal - shipping - home - insurance)
    const reference = shipment.id.slice(0, 8)
    const orderId = orders[0]?.id

    await this.wallets.post(PlatformAccount.EXPORT, 'credit', {
      type: WalletTransactionType.EXPORT_SHIPPING_INCOME,
      amount: cents(shipping + home),
      description: home > 0 ? `Transport et livraison à domicile — colis ${reference}` : `Transport — colis ${reference}`,
      orderId,
    })
    await this.wallets.post(PlatformAccount.EXPORT, 'credit', {
      type: WalletTransactionType.EXPORT_INSURANCE_INCOME,
      amount: insurance,
      description: `Assurance — colis ${reference}`,
      orderId,
    })
    if (packDelta !== 0) {
      await this.wallets.post(PlatformAccount.EXPORT, packDelta > 0 ? 'credit' : 'debit', {
        type: WalletTransactionType.EXPORT_PACK_COMPENSATION,
        amount: Math.abs(packDelta),
        description: packDelta > 0 ? `Marge pack eBio — colis ${reference}` : `Compensation pack eBio — colis ${reference}`,
        orderId,
      })
    }

    try {
      await this.logistics.refreshFill(shipment.departure.id)
    }
    catch (error) {
      this.logger.error(`Remplissage du départ ${shipment.departure.id} non mis à jour`, error instanceof Error ? error.stack : String(error))
    }
    await this.notifier.shipmentPaid({ buyerId: shipment.buyer.id, shipmentId: shipment.id, departsOn: shipment.departure.departsOn })
  }
}
