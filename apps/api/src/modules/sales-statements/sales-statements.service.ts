import type { Buffer } from 'node:buffer'
import type { SalesStatementLink } from './contracts/sales-statement.contract'
import type { StatementContent, StatementOrderRow, StatementProductRow } from './sales-statement-workbook'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { config } from '../../config/env.config'
import { Delivery, DeliveryStatus } from '../deliveries/entities/delivery.entity'
import { EmailService } from '../email/email.service'
import { Order, OrderStatus, PaymentMethod, PickupMode } from '../orders/entities/order.entity'
import { formatFcfa } from '../orders/order-format'
import { supplierShare } from '../payments/supplier-share'
import { DEFAULT_TIMEZONE, Supplier } from '../suppliers/supplier.entity'
import { createStatementToken, readStatementToken, STATEMENT_LINK_TTL_MS } from './sales-statement-token'
import { renderStatementWorkbook } from './sales-statement-workbook'
import { periodLabel, statementRange, zoneOffsetMs } from './statement-period'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.PENDING_PAYMENT]: 'Paiement en attente',
  [OrderStatus.PLACED]: 'Nouvelle',
  [OrderStatus.ACCEPTED]: 'Acceptée',
  [OrderStatus.PREPARING]: 'En préparation',
  [OrderStatus.READY]: 'Prête',
  [OrderStatus.IN_DELIVERY]: 'En livraison',
  [OrderStatus.DELIVERED]: 'Livrée',
  [OrderStatus.CANCELLED]: 'Annulée',
  [OrderStatus.DISPUTED]: 'En litige',
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.FEDAPAY]: 'En ligne',
  [PaymentMethod.CASH_ON_DELIVERY]: 'Espèces',
  [PaymentMethod.WALLET]: 'Portefeuille',
  [PaymentMethod.FAMILY_WALLET]: 'Portefeuille famille',
}

const COMBINING_MARKS = /\p{M}/gu
const NON_SLUG_CHARACTERS = /[^a-z0-9]+/g
const EDGE_DASHES = /^-|-$/g

function slugify(name: string): string {
  return name.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().replace(NON_SLUG_CHARACTERS, '-').replace(EDGE_DASHES, '')
}

function round(amount: number): number {
  return Math.round(amount * 100) / 100
}

export interface SalesStatementFile {
  filename: string
  contentType: string
  content: Buffer
}

@Injectable()
export class SalesStatementsService {
  constructor(
    private readonly em: EntityManager,
    private readonly emailService: EmailService,
  ) {}

  /** The shop the signed-in owner runs. */
  async findSupplierOfUser(userId: string): Promise<Supplier> {
    const supplier = await this.em.findOne(Supplier, { user: { id: userId } }, { populate: ['user'] })
    if (!supplier)
      throw new NotFoundException('Boutique introuvable')
    return supplier
  }

  async findSupplier(supplierId: string): Promise<Supplier> {
    const supplier = await this.em.findOne(Supplier, { id: supplierId }, { populate: ['user'] })
    if (!supplier)
      throw new NotFoundException('Boutique introuvable')
    return supplier
  }

  async generate(supplier: Supplier, from: string, to: string): Promise<SalesStatementFile & { content: Buffer, summary: StatementContent['summary'] }> {
    const timeZone = supplier.timezone || DEFAULT_TIMEZONE
    const range = statementRange(from, to, timeZone)
    const content = await this.collect(supplier, range.start, range.end, timeZone)
    content.periodLabel = periodLabel(from, to)

    const period = from === to ? from : `${from}_${to}`
    return {
      filename: `releve-ventes-${slugify(supplier.shopName) || 'boutique'}-${period}.xlsx`,
      contentType: XLSX_MIME,
      content: await renderStatementWorkbook(content),
      summary: content.summary,
    }
  }

  /** Sends the statement as an attachment; returns the address it went to. */
  async send(supplier: Supplier, from: string, to: string, email?: string): Promise<string> {
    const recipient = email ?? supplier.user?.email
    if (!recipient)
      throw new BadRequestException('Aucune adresse e-mail pour cette boutique')

    const file = await this.generate(supplier, from, to)
    const label = periodLabel(from, to)
    await this.emailService.sendTemplatedEmail({
      to: recipient,
      subject: `Relevé des ventes ${supplier.shopName}, ${label}`,
      template: 'sales-statement',
      data: {
        shopName: supplier.shopName,
        periodLabel: label,
        deliveredCount: file.summary.deliveredCount,
        deliveredAmount: formatFcfa(file.summary.deliveredAmount),
        commissionAmount: formatFcfa(file.summary.commissionAmount),
        shopShare: formatFcfa(file.summary.shopShare),
        inProgressCount: file.summary.inProgressCount,
      },
      attachments: [{ filename: file.filename, content: file.content, contentType: file.contentType }],
    })
    return recipient
  }

  /** A link the phone's browser can open without the app's session. */
  createLink(supplier: Supplier, from: string, to: string): SalesStatementLink {
    statementRange(from, to, supplier.timezone || DEFAULT_TIMEZONE)
    const expiresAt = Date.now() + STATEMENT_LINK_TTL_MS
    const token = createStatementToken({ supplierId: supplier.id, from, to, expiresAt })
    return {
      url: `${config.api.baseUrl}/api/sales-statements/download?token=${encodeURIComponent(token)}`,
      expiresAt: new Date(expiresAt).toISOString(),
    }
  }

  async generateFromToken(token: string): Promise<SalesStatementFile> {
    const payload = readStatementToken(token)
    if (!payload)
      throw new BadRequestException('Lien expiré ou invalide : relancez l\'export depuis l\'application')
    const supplier = await this.findSupplier(payload.supplierId)
    return this.generate(supplier, payload.from, payload.to)
  }

  /**
   * Every order the shop saw in the period, an unpaid online order never
   * reached it, so it is left out. Money is only summed over delivered orders:
   * an order in progress can still be cancelled.
   */
  private async collect(supplier: Supplier, start: Date, end: Date, timeZone: string): Promise<StatementContent> {
    const orders = await this.em.find(Order, {
      supplier: { id: supplier.id },
      status: { $ne: OrderStatus.PENDING_PAYMENT },
      createdAt: { $gte: start, $lt: end },
    }, {
      populate: ['buyer', 'items', 'items.product', 'items.variant'],
      orderBy: { createdAt: 'ASC' },
    })

    const deliveredIds = orders.filter(order => order.status === OrderStatus.DELIVERED).map(order => order.id)
    const courierDelivered = new Set(
      deliveredIds.length === 0
        ? []
        : (await this.em.find(Delivery, {
            order: { id: { $in: deliveredIds } },
            status: DeliveryStatus.DELIVERED,
            courier: { $ne: null },
          }, { fields: ['order'] })).map(delivery => delivery.order.id),
    )

    const toWallClock = (date: Date) => new Date(date.getTime() + zoneOffsetMs(timeZone, date))
    const summary: StatementContent['summary'] = {
      deliveredCount: 0,
      deliveredAmount: 0,
      commissionAmount: 0,
      shopShare: 0,
      inProgressCount: 0,
      inProgressAmount: 0,
      cancelledCount: 0,
    }
    const products = new Map<string, StatementProductRow>()
    const rows: StatementOrderRow[] = []

    for (const order of orders) {
      const items = order.items.getItems()
      const isDelivered = order.status === OrderStatus.DELIVERED
      const totalAmount = Number(order.totalAmount)
      const commissionAmount = Number(order.commissionAmount)
      const share = isDelivered
        ? supplierShare({
          paymentAmount: totalAmount,
          commissionAmount,
          deliveryFee: Number(order.deliveryFee),
          deliveredByCourier: courierDelivered.has(order.id),
          discountFundedBy: order.discountFundedBy,
          discountAmount: Number(order.discountAmount),
          platformPromoCompensation: Number(order.platformPromoCompensation),
        }).total
        : null

      rows.push({
        placedAt: toWallClock(order.createdAt),
        orderNumber: order.orderNumber,
        buyerName: order.buyer?.name ?? '',
        status: STATUS_LABELS[order.status] ?? order.status,
        pickupMode: order.pickupMode === PickupMode.DELIVERY ? 'Livraison' : order.pickupMode === PickupMode.EXPORT ? 'Export (terroir)' : 'Retrait',
        paymentMethod: PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod,
        itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
        itemsAmount: round(items.reduce((sum, item) => sum + Number(item.totalPrice), 0)),
        discountAmount: Number(order.discountAmount),
        deliveryFee: Number(order.deliveryFee),
        totalAmount,
        commissionAmount: isDelivered ? commissionAmount : 0,
        shopShare: share,
      })

      if (order.status === OrderStatus.CANCELLED) {
        summary.cancelledCount += 1
        continue
      }
      if (!isDelivered) {
        summary.inProgressCount += 1
        summary.inProgressAmount += totalAmount
        continue
      }

      summary.deliveredCount += 1
      summary.deliveredAmount += totalAmount
      summary.commissionAmount += commissionAmount
      summary.shopShare += share ?? 0
      for (const item of items) {
        const variant = item.variant?.label ?? ''
        const key = `${item.product.id}:${item.variant?.id ?? ''}`
        const line = products.get(key) ?? { name: item.product.name, variant, quantity: 0, giftQuantity: 0, amount: 0 }
        line.quantity += item.quantity
        if (item.isGift)
          line.giftQuantity += item.quantity
        line.amount = round(line.amount + Number(item.totalPrice))
        products.set(key, line)
      }
    }

    summary.deliveredAmount = round(summary.deliveredAmount)
    summary.commissionAmount = round(summary.commissionAmount)
    summary.shopShare = round(summary.shopShare)
    summary.inProgressAmount = round(summary.inProgressAmount)

    return {
      shopName: supplier.shopName,
      periodLabel: '',
      generatedAt: toWallClock(new Date()),
      summary,
      orders: rows,
      products: [...products.values()].sort((a, b) => b.amount - a.amount),
    }
  }
}
