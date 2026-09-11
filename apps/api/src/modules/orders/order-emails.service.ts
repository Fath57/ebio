import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { EmailService } from '../email/email.service'
import { Order, PickupMode } from './entities/order.entity'
import { buildInvoiceItems, formatFcfa, formatInvoiceDate, PAYMENT_LABELS } from './order-format'

/**
 * Written trace of a fresh order: a recap to the buyer and an alert to the
 * shop, both listing the items with their photos. Sent the moment the order
 * becomes real — right away for cash and wallet, at payment confirmation for
 * FedaPay. Never throws: a mail server outage must not fail a paid order.
 *
 * Lives in its own module so the payments module can trigger it without
 * depending on OrdersService (which already depends on payments).
 */
@Injectable()
export class OrderEmailsService {
  private readonly logger = new Logger(OrderEmailsService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly emailService: EmailService,
  ) {}

  async sendOrderPlaced(orderId: string): Promise<void> {
    try {
      const em = this.em.fork()
      const order = await em.findOneOrFail(Order, { id: orderId }, {
        populate: ['buyer', 'supplier', 'supplier.user', 'items', 'items.product', 'items.variant'],
      })
      const items = buildInvoiceItems(order)
      const subtotal = order.items.getItems().reduce((sum, item) => sum + item.totalPrice, 0)
      const isDelivery = order.pickupMode === PickupMode.DELIVERY

      const data = {
        orderNumber: order.orderNumber,
        orderDate: formatInvoiceDate(order.createdAt),
        buyerName: order.buyer.name,
        shopName: order.supplier.shopName,
        items,
        subtotal: formatFcfa(subtotal),
        discount: order.discountAmount > 0 ? formatFcfa(order.discountAmount) : null,
        deliveryFee: order.deliveryFee > 0 ? formatFcfa(order.deliveryFee) : null,
        deliveryOffered: isDelivery && order.deliveryFee === 0,
        total: formatFcfa(order.totalAmount),
        paymentLabel: PAYMENT_LABELS[order.paymentMethod],
        isDelivery,
        deliveryAddress: order.deliveryAddress ?? null,
        deliverySlot: order.deliverySlot ?? null,
        readyHint: isDelivery
          ? 'Vous serez prévenu dès que la boutique prépare votre commande, puis quand le livreur est en route.'
          : 'Vous serez prévenu dès que votre commande est prête à être retirée.',
        orderUrl: `ebio-mobile://orders/${order.id}`,
      }

      if (order.buyer.email) {
        await this.emailService.sendTemplatedEmail({
          to: order.buyer.email,
          subject: `Commande confirmée — ${order.orderNumber}`,
          template: 'order-confirmation',
          data,
        })
      }
      const shopEmail = order.supplier.user?.email
      if (shopEmail) {
        await this.emailService.sendTemplatedEmail({
          to: shopEmail,
          subject: `Nouvelle commande ${order.orderNumber} — ${formatFcfa(order.totalAmount)}`,
          template: 'order-new-supplier',
          data: { ...data, buyerPhone: order.buyer.phone ?? null },
        })
      }
    }
    catch (error) {
      this.logger.error(`Failed to send the confirmation e-mails for order ${orderId}`, error)
    }
  }
}
