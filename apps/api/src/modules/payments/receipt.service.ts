import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Order } from '../orders/entities/order.entity'
import { Payment } from './payment.entity'

interface ReceiptData {
  orderNumber: string
  buyerName: string
  supplierName: string
  items: Array<{
    productName: string
    quantity: number
    unitPrice: number
    totalPrice: number
  }>
  totalAmount: number
  paymentMethod: string
  paidAt: Date | null
  createdAt: Date
}

@Injectable()
export class ReceiptService {
  private readonly logger = new Logger(ReceiptService.name)

  constructor(private readonly em: EntityManager) {}

  async generate(orderId: string): Promise<ReceiptData> {
    const order = await this.em.findOne(Order, { id: orderId }, {
      populate: ['buyer', 'supplier', 'items', 'items.product'],
    })

    if (!order) {
      throw new NotFoundException('Order not found')
    }

    const payment = await this.em.findOne(Payment, { order: { id: orderId } })

    return {
      orderNumber: order.orderNumber,
      buyerName: order.buyer.name,
      supplierName: order.supplier.shopName,
      items: order.items.getItems().map(item => ({
        productName: item.product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      })),
      totalAmount: order.totalAmount,
      paymentMethod: order.paymentMethod,
      paidAt: payment?.paidAt ?? null,
      createdAt: order.createdAt,
    }
  }

  async sendReceipt(orderId: string, channel: 'sms' | 'whatsapp'): Promise<void> {
    const receiptData = await this.generate(orderId)
    this.logger.debug(`[RECEIPT] Sending via ${channel} for order ${receiptData.orderNumber}`)
    // TODO: Implement SMS/WhatsApp receipt delivery
  }
}
