import type { OnModuleInit } from '@nestjs/common'
import type { CreditedTopup } from '../wallet/topup.service'
import type { TerroirSupplementInput } from './contracts/terroir.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { HttpStatus, Injectable, Logger } from '@nestjs/common'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { WalletTransactionType } from '../wallet/entities/wallet-transaction.entity'
import { PlatformAccount } from '../wallet/entities/wallet.entity'
import { TopupService } from '../wallet/topup.service'
import { WalletService } from '../wallet/wallet.service'
import { ExportShipmentStatus, ExportSupplementStatus } from './contracts/terroir.contract'
import { ExportShipmentEvent } from './entities/export-shipment-event.entity'
import { ExportShipment } from './entities/export-shipment.entity'
import { ExportShipmentsService, SUPPLEMENT_WINDOW_HOURS } from './export-shipments.service'
import { supplementFor } from './terroir-math'
import { TerroirNotifierService } from './terroir-notifier.service'
import { terroirError } from './terroir-texts'

const HOUR_MS = 60 * 60 * 1000

/** Where a supplement stands after the buyer's choice, with the card payment to open if any. */
export interface SupplementOutcome {
  shipment: ExportShipment
  topupId: string | null
  paymentUrl: string | null
  providerTransactionId: string | null
}

/** Parcels still at eBio's: the only ones a supplement can be answered on. */
const AT_EBIO = [ExportShipmentStatus.PAID, ExportShipmentStatus.COLLECTING, ExportShipmentStatus.PACKED]

/**
 * The buyer's answer to a weight supplement (011, T039, FR-020): pay it, or
 * take a product out (refunded). Unanswered after 48 h, eBio absorbs it.
 *
 * Paying by card goes through a wallet top-up of the supplement's amount,
 * the same INTRAM hosted page, verification and reconciliation as any
 * recharge, and the supplement is debited from the wallet the moment the
 * top-up is credited. A checkout or a payment row would have needed an
 * order to hang on; a supplement belongs to no shop.
 */
@Injectable()
export class ExportSupplementService implements OnModuleInit {
  private readonly logger = new Logger(ExportSupplementService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly wallets: WalletService,
    private readonly topups: TopupService,
    private readonly shipments: ExportShipmentsService,
    private readonly notifier: TerroirNotifierService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  onModuleInit(): void {
    this.topups.onCredited(topup => this.onTopupCredited(topup))
  }

  async choose(buyerId: string, shipmentId: string, input: TerroirSupplementInput): Promise<SupplementOutcome> {
    const shipment = await this.em.findOne(ExportShipment, { id: shipmentId, buyer: buyerId }, { populate: ['checkout'], refresh: true })
    if (!shipment) {
      throw terroirError(HttpStatus.NOT_FOUND, 'EXPORT_SHIPMENT_NOT_FOUND', 'Colis introuvable.')
    }
    if (shipment.supplementStatus !== ExportSupplementStatus.REQUESTED || !AT_EBIO.includes(shipment.status)) {
      throw terroirError(HttpStatus.CONFLICT, 'EXPORT_SUPPLEMENT_NOT_REQUESTED', 'Aucun complément n\'est demandé pour ce colis.')
    }
    const amount = Number(shipment.supplementAmount)

    if (input.choice === 'REMOVE_ITEM') {
      return { shipment: await this.removeItem(shipment, input.lineId!), topupId: null, paymentUrl: null, providerTransactionId: null }
    }

    if (input.paymentMethod === 'WALLET') {
      const wallet = await this.wallets.getOrCreate({ userId: buyerId })
      await this.settle(shipment.id, wallet.id, amount)
      return { shipment: await this.reload(shipment.id), topupId: null, paymentUrl: null, providerTransactionId: null }
    }

    const opened = await this.topups.initiate(buyerId, amount)
    shipment.supplementTopupId = opened.topupId
    await this.em.flush()
    return { shipment, topupId: opened.topupId, paymentUrl: opened.paymentUrl, providerTransactionId: opened.providerTransactionId }
  }

  /** A top-up credited: if it was opened for a supplement still asked, the supplement is paid from it. */
  async onTopupCredited(topup: CreditedTopup): Promise<void> {
    const shipment = await this.em.fork().findOne(ExportShipment, { supplementTopupId: topup.topupId })
    if (!shipment) {
      return
    }
    if (shipment.supplementStatus !== ExportSupplementStatus.REQUESTED) {
      // Waived or removed meanwhile: the money stays on the buyer's wallet.
      return
    }
    try {
      await this.settle(shipment.id, topup.walletId, Number(shipment.supplementAmount))
    }
    catch (error) {
      this.logger.error(`Supplement of ${shipment.id} not settled from top-up ${topup.topupId}`, error instanceof Error ? error.stack : String(error))
    }
  }

  /**
   * Unanswered for 48 h: eBio absorbs the gap and the parcel leaves (FR-020).
   * Conditional, so a payment landing at the same moment wins or loses cleanly.
   */
  async waiveOverdue(now: Date): Promise<number> {
    const limit = new Date(now.getTime() - SUPPLEMENT_WINDOW_HOURS * HOUR_MS)
    const rows = await this.em.getConnection().execute(
      `UPDATE export_shipments SET supplement_status = ?, updated_at = NOW()
       WHERE supplement_status = ? AND supplement_requested_at <= ?
       RETURNING id, supplement_amount`,
      [ExportSupplementStatus.WAIVED, ExportSupplementStatus.REQUESTED, limit],
    ) as Array<{ id: string, supplement_amount: string | null }>
    for (const row of rows) {
      const amount = Number(row.supplement_amount ?? 0)
      await this.wallets.post(PlatformAccount.EXPORT, 'debit', {
        type: WalletTransactionType.EXPORT_LOSS,
        amount,
        description: `Écart de poids pris en charge, colis ${row.id.slice(0, 8)}`,
      })
      await this.event(row.id, 'Sans réponse sous 48 h, eBio prend en charge le complément de poids : votre colis part sans rien de plus à payer.')
    }
    return rows.length
  }

  /** Marks the supplement PAID, then debits the wallet; a refused debit puts it back as asked. */
  private async settle(shipmentId: string, walletId: string, amount: number): Promise<void> {
    const rows = await this.em.getConnection().execute(
      `UPDATE export_shipments SET supplement_status = ?, updated_at = NOW() WHERE id = ? AND supplement_status = ? RETURNING id`,
      [ExportSupplementStatus.PAID, shipmentId, ExportSupplementStatus.REQUESTED],
    ) as Array<{ id: string }>
    if (rows.length === 0) {
      throw terroirError(HttpStatus.CONFLICT, 'EXPORT_SUPPLEMENT_NOT_REQUESTED', 'Aucun complément n\'est demandé pour ce colis.')
    }
    const reference = shipmentId.slice(0, 8)
    try {
      await this.wallets.debit(walletId, {
        type: WalletTransactionType.ORDER_PAYMENT,
        amount,
        description: `Complément de poids, valise ${reference}`,
      })
    }
    catch (error) {
      await this.em.getConnection().execute(
        `UPDATE export_shipments SET supplement_status = ? WHERE id = ? AND supplement_status = ?`,
        [ExportSupplementStatus.REQUESTED, shipmentId, ExportSupplementStatus.PAID],
      )
      throw error
    }
    await this.wallets.post(PlatformAccount.EXPORT, 'credit', {
      type: WalletTransactionType.EXPORT_SHIPPING_INCOME,
      amount,
      description: `Complément de poids, colis ${reference}`,
    })
    await this.event(shipmentId, 'Complément de poids réglé : votre colis part comme prévu.')
  }

  /**
   * One product out of the weighed parcel, refunded. If the parcel then fits
   * what was paid for, nothing more is asked (ITEM_REMOVED); otherwise the
   * supplement is recomputed and stays asked, same deadline.
   */
  private async removeItem(shipment: ExportShipment, lineId: string): Promise<ExportShipment> {
    const item = await this.shipments.lineOf(shipment, lineId)
    await this.shipments.removeLine(shipment, item, `${item.product.name} retiré du colis à votre demande et remboursé.`, 'actual', shipment.buyer.id)
    const fresh = await this.reload(shipment.id)
    if (fresh.status === ExportShipmentStatus.CANCELLED || fresh.supplementStatus !== ExportSupplementStatus.REQUESTED) {
      return fresh
    }
    const { weightTolerancePct } = await this.platformSettings.getTerroirExportSettings()
    const amount = fresh.actualWeightG == null
      ? null
      : supplementFor(fresh.estimatedWeightG, fresh.actualWeightG, this.shipments.rateOf(fresh), weightTolerancePct)
    if (amount === null) {
      fresh.supplementStatus = ExportSupplementStatus.ITEM_REMOVED
      fresh.supplementTopupId = null
    }
    else {
      fresh.supplementAmount = String(amount)
    }
    await this.em.flush()
    if (amount !== null) {
      await this.notifier.supplementRequested({
        shipmentId: fresh.id,
        amount,
        estimatedG: fresh.estimatedWeightG,
        actualG: fresh.actualWeightG!,
        deadline: new Date(fresh.supplementRequestedAt!.getTime() + SUPPLEMENT_WINDOW_HOURS * HOUR_MS),
      })
    }
    return fresh
  }

  private async reload(shipmentId: string): Promise<ExportShipment> {
    return this.em.findOneOrFail(ExportShipment, { id: shipmentId }, { populate: ['checkout'], refresh: true })
  }

  private async event(shipmentId: string, message: string): Promise<void> {
    const em = this.em.fork()
    em.create(ExportShipmentEvent, { shipment: em.getReference(ExportShipment, shipmentId), step: null, message, author: null })
    await em.flush()
    await this.notifier.shipmentNews({ shipmentId, step: null, message, pickupPoint: null })
  }
}
