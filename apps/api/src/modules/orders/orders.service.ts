import type { CreateDispute, CreateOrder } from './contracts/order.contract'
import { EnsureRequestContext } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { computeDeliveryFee } from '../../common/delivery-fee'
import { User } from '../auth/auth.entity'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { CommissionService } from '../payments/commission.service'
import { Payment, PaymentProvider, PaymentStatus } from '../payments/payment.entity'
import { ProductVariant } from '../products/entities/product-variant.entity'
import { Product } from '../products/entities/product.entity'
import { Supplier, SupplierMode } from '../suppliers/supplier.entity'
import { WalletTransactionType } from '../wallet/entities/wallet-transaction.entity'
import { WalletService } from '../wallet/wallet.service'
import { Dispute } from './entities/dispute.entity'
import { OrderItem } from './entities/order-item.entity'
import { Order, OrderStatus, PaymentMethod, PickupMode } from './entities/order.entity'

interface OrderFilters {
  status?: OrderStatus
  page?: number
  limit?: number
}

const VALID_TRANSITIONS: Record<string, OrderStatus[]> = {
  [OrderStatus.ACCEPTED]: [OrderStatus.PREPARING],
  [OrderStatus.PREPARING]: [OrderStatus.READY],
  [OrderStatus.READY]: [OrderStatus.IN_DELIVERY],
  [OrderStatus.IN_DELIVERY]: [OrderStatus.DELIVERED],
}

const TWO_MINUTES_MS = 2 * 60 * 1000
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000
const _FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly notificationsService: NotificationsService,
    private readonly commissionService: CommissionService,
    private readonly walletService: WalletService,
  ) {}

  async create(buyerId: string, data: CreateOrder): Promise<Order> {
    const buyer = await this.em.findOneOrFail(User, { id: buyerId })

    const supplier = await this.em.findOne(Supplier, { id: data.supplierId }, { populate: ['user'] })
    if (!supplier) {
      throw new NotFoundException('Supplier not found')
    }

    if (supplier.mode !== SupplierMode.ORDER) {
      throw new BadRequestException('This supplier does not accept online orders. Use contact mode instead.')
    }

    const products = await this.validateAndLoadItems(data.items)

    await this.checkDuplicateOrder(buyerId, data.supplierId, data.items)

    const orderNumber = await this.generateOrderNumber()

    let totalAmount = 0
    const itemEntities: Array<{ product: Product, variant?: ProductVariant, quantity: number, unitPrice: number, totalPrice: number }> = []

    for (const itemInput of data.items) {
      const product = products.get(itemInput.productId)!
      let unitPrice = product.pricePerUnit
      let variant: ProductVariant | undefined

      if (itemInput.variantId) {
        variant = await this.em.findOne(ProductVariant, { id: itemInput.variantId, product: { id: product.id } }) ?? undefined
        if (!variant) {
          throw new NotFoundException(`Variant ${itemInput.variantId} not found for product ${product.name}`)
        }
        unitPrice = variant.pricePerUnit
      }

      if (product.promotionalPrice && (!product.promotionExpiresAt || product.promotionExpiresAt > new Date())) {
        unitPrice = product.promotionalPrice
      }

      const totalPrice = Math.round(unitPrice * itemInput.quantity * 100) / 100
      totalAmount += totalPrice

      itemEntities.push({ product, variant, quantity: itemInput.quantity, unitPrice, totalPrice })
    }

    // Each item pays its own category's rate, unless the shop negotiated a
    // flat rate. The base is the items only. Delivery is the shop's own cost,
    // passed through to it in full, and the platform takes no cut of it.
    const commissionItems = await Promise.all(itemEntities.map(async item => ({
      categorySlug: await this.getCategorySlug(item.product),
      totalPrice: item.totalPrice,
    })))
    const commission = await this.commissionService.calculateForItems(
      commissionItems,
      supplier.commissionRate,
    )

    const deliveryFee = computeDeliveryFee(supplier, data.pickupMode === PickupMode.DELIVERY, totalAmount)

    const order = this.em.create(Order, {
      orderNumber,
      buyer,
      supplier,
      pickupMode: data.pickupMode as PickupMode,
      paymentMethod: data.paymentMethod as PaymentMethod,
      deliveryAddress: data.deliveryAddress,
      deliverySlot: data.deliverySlot || undefined,
      deliveryFee,
      totalAmount: totalAmount + deliveryFee,
      commissionRate: commission.rate,
      commissionAmount: commission.commissionAmount,
    })

    for (const itemData of itemEntities) {
      this.em.create(OrderItem, {
        order,
        product: itemData.product,
        variant: itemData.variant,
        quantity: itemData.quantity,
        unitPrice: itemData.unitPrice,
        totalPrice: itemData.totalPrice,
      })
    }

    await this.em.flush()

    // Wallet checkout: the buyer's money is already on the platform account,
    // so the debit is immediate and the payment starts straight in escrow.
    if (order.paymentMethod === PaymentMethod.WALLET) {
      const wallet = await this.walletService.getOrCreate({ userId: buyer.id })
      try {
        await this.walletService.debit(wallet.id, {
          type: WalletTransactionType.ORDER_PAYMENT,
          amount: order.totalAmount,
          description: `Commande ${order.orderNumber}`,
          orderId: order.id,
        })
      }
      catch (error) {
        // Insufficient balance: the order must not survive its failed
        // payment. Items first — they hold the FK.
        await this.em.nativeDelete(OrderItem, { order: order.id })
        await this.em.nativeDelete(Order, { id: order.id })
        throw error
      }
      this.em.create(Payment, {
        order,
        amount: order.totalAmount,
        provider: PaymentProvider.FEDAPAY,
        paymentMethod: 'WALLET',
        status: PaymentStatus.ESCROW,
        paidAt: new Date(),
      })
      await this.em.flush()
    }

    // For online payments (FedaPay), notifications are sent after payment confirmation.
    // Cash and wallet orders have no pending payment step: notify at once.
    if (order.paymentMethod !== PaymentMethod.FEDAPAY) {
      await this.sendOrderPlacedNotifications(order)
    }

    return order
  }

  private async sendOrderPlacedNotifications(order: Order): Promise<void> {
    const populated = await this.em.findOneOrFail(Order, { id: order.id }, {
      populate: ['buyer', 'supplier', 'supplier.user'],
    })
    await Promise.all([
      this.notificationsService.send({
        user: populated.supplier.user,
        type: NotificationType.ORDER_PLACED,
        title: 'Nouvelle commande',
        body: `Commande ${populated.orderNumber} reçue pour ${populated.totalAmount} FCFA`,
        data: { orderId: populated.id, orderNumber: populated.orderNumber },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      }),
      this.notificationsService.send({
        user: populated.buyer,
        type: NotificationType.ORDER_PLACED,
        title: 'Commande confirmée',
        body: `Votre commande ${populated.orderNumber} a été envoyée au fournisseur`,
        data: { orderId: populated.id, orderNumber: populated.orderNumber },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      }),
    ])
  }

  async findById(id: string): Promise<Order> {
    const order = await this.em.findOne(Order, { id }, {
      populate: ['buyer', 'supplier', 'items', 'items.product', 'items.variant'],
    })
    if (!order) {
      throw new NotFoundException('Order not found')
    }
    return order
  }

  async findByBuyer(buyerId: string, filters: OrderFilters = {}): Promise<{ orders: Order[], total: number }> {
    const where: Record<string, unknown> = { buyer: { id: buyerId } }
    if (filters.status) {
      where.status = filters.status
    }

    const limit = filters.limit ?? 20
    const offset = ((filters.page ?? 1) - 1) * limit

    const [orders, total] = await this.em.findAndCount(Order, where, {
      populate: ['supplier', 'items', 'items.product'],
      orderBy: { createdAt: 'DESC' },
      limit,
      offset,
    })

    return { orders, total }
  }

  async findBySupplier(supplierId: string, filters: OrderFilters = {}): Promise<{ orders: Order[], total: number }> {
    const where: Record<string, unknown> = { supplier: { id: supplierId } }
    if (filters.status) {
      where.status = filters.status
    }

    const limit = filters.limit ?? 20
    const offset = ((filters.page ?? 1) - 1) * limit

    const [orders, total] = await this.em.findAndCount(Order, where, {
      populate: ['buyer', 'items', 'items.product'],
      orderBy: { createdAt: 'DESC' },
      limit,
      offset,
    })

    return { orders, total }
  }

  async accept(orderId: string, supplierId: string): Promise<Order> {
    const order = await this.findById(orderId)
    this.verifySupplierOwnership(order, supplierId)

    if (order.status !== OrderStatus.PLACED) {
      throw new BadRequestException('Only placed orders can be accepted')
    }

    for (const item of order.items.getItems()) {
      const product = item.product
      if (item.variant) {
        if (item.variant.stock < item.quantity) {
          throw new BadRequestException(`Insufficient stock for variant ${item.variant.label} of ${product.name}`)
        }
        item.variant.stock -= item.quantity
      }
      else {
        if (product.stock < item.quantity) {
          throw new BadRequestException(`Insufficient stock for ${product.name}`)
        }
        product.stock -= item.quantity
      }
    }

    order.status = OrderStatus.ACCEPTED
    order.acceptedAt = new Date()
    await this.em.flush()

    await this.notificationsService.send({
      user: order.buyer,
      type: NotificationType.ORDER_ACCEPTED,
      title: 'Commande acceptée',
      body: `Votre commande ${order.orderNumber} a été acceptée`,
      data: { orderId: order.id },
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    })

    return order
  }

  async reject(orderId: string, supplierId: string, reason: string): Promise<Order> {
    const order = await this.findById(orderId)
    this.verifySupplierOwnership(order, supplierId)

    if (order.status !== OrderStatus.PLACED) {
      throw new BadRequestException('Only placed orders can be rejected')
    }

    order.status = OrderStatus.CANCELLED

    const payment = await this.em.findOne(Payment, { order: { id: orderId } })
    if (payment && payment.status === PaymentStatus.CAPTURED) {
      payment.status = PaymentStatus.REFUNDED
    }

    await this.em.flush()

    await this.notificationsService.send({
      user: order.buyer,
      type: NotificationType.ORDER_REJECTED,
      title: 'Commande refusée',
      body: `Votre commande ${order.orderNumber} a été refusée : ${reason}`,
      data: { orderId: order.id, reason },
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    })

    return order
  }

  async updateStatus(orderId: string, supplierId: string, newStatus: OrderStatus): Promise<Order> {
    const order = await this.findById(orderId)
    this.verifySupplierOwnership(order, supplierId)

    const allowedTransitions = VALID_TRANSITIONS[order.status]
    if (!allowedTransitions?.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${order.status} to ${newStatus}`,
      )
    }

    await this.applyStatus(order, newStatus)
    return order
  }

  /**
   * The back-office path: an admin resolves stuck orders, so every status is
   * reachable, without the supplier-side transition rules. The buyer gets the
   * same notifications as when the supplier moves the order.
   */
  async adminUpdateStatus(orderId: string, newStatus: OrderStatus): Promise<Order> {
    const order = await this.findById(orderId)
    await this.applyStatus(order, newStatus)
    return order
  }

  /** Writes the status and sends the buyer-facing notifications it triggers. */
  private async applyStatus(order: Order, newStatus: OrderStatus): Promise<void> {
    order.status = newStatus

    if (newStatus === OrderStatus.DELIVERED) {
      order.deliveredAt = new Date()
    }

    await this.em.flush()

    // Cash order: eBio never touches the money, so its commission is
    // collected as a wallet debit — the shop balance may go negative and the
    // debt is absorbed by future sale credits.
    if (
      newStatus === OrderStatus.DELIVERED
      && order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY
      && order.commissionAmount > 0
    ) {
      const alreadyDebited = await this.em.getConnection().execute(
        `SELECT 1 FROM wallet_transactions WHERE order_id = ? AND type = 'COMMISSION_DEBIT' LIMIT 1`,
        [order.id],
      )
      if (alreadyDebited.length === 0) {
        const wallet = await this.walletService.getOrCreate({ supplierId: order.supplier.id })
        await this.walletService.debit(wallet.id, {
          type: WalletTransactionType.COMMISSION_DEBIT,
          amount: order.commissionAmount,
          description: `Commission eBio — commande ${order.orderNumber} (espèces)`,
          orderId: order.id,
          allowNegative: true,
        })
      }
    }

    if (newStatus === OrderStatus.READY) {
      await this.notificationsService.send({
        user: order.buyer,
        type: NotificationType.ORDER_READY,
        title: 'Commande prête',
        body: `Votre commande ${order.orderNumber} est prête`,
        data: { orderId: order.id },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      })
    }

    if (newStatus === OrderStatus.DELIVERED) {
      await this.notificationsService.send({
        user: order.buyer,
        type: NotificationType.ORDER_DELIVERED,
        title: 'Commande livrée',
        body: `Votre commande ${order.orderNumber} a été livrée. Confirmez la réception dans l'app.`,
        data: { orderId: order.id },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      })
    }
  }

  async confirmDelivery(orderId: string, userId: string): Promise<Order> {
    const order = await this.findById(orderId)

    const isBuyer = order.buyer.id === userId
    const isSupplier = order.supplier.user?.id === userId

    if (!isBuyer && !isSupplier) {
      throw new ForbiddenException('Only the buyer or supplier can confirm delivery')
    }

    if (order.status !== OrderStatus.DELIVERED && order.status !== OrderStatus.IN_DELIVERY) {
      throw new BadRequestException('Order must be delivered or in delivery to confirm')
    }

    if (isBuyer) {
      order.deliveryConfirmedByBuyer = true
    }

    if (isSupplier) {
      order.deliveryConfirmedBySupplier = true
    }

    if (order.status !== OrderStatus.DELIVERED) {
      order.status = OrderStatus.DELIVERED
      order.deliveredAt = new Date()
    }

    await this.em.flush()

    return order
  }

  async createDispute(orderId: string, buyerId: string, data: CreateDispute): Promise<Dispute> {
    const order = await this.findById(orderId)

    if (order.buyer.id !== buyerId) {
      throw new ForbiddenException('Only the buyer can open a dispute')
    }

    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('Disputes can only be opened on delivered orders')
    }

    if (order.deliveredAt) {
      const hoursSinceDelivery = (Date.now() - order.deliveredAt.getTime()) / (1000 * 60 * 60)
      if (hoursSinceDelivery > 48) {
        throw new BadRequestException('Disputes must be opened within 48 hours of delivery')
      }
    }

    const existingDispute = await this.em.findOne(Dispute, { order: { id: orderId } })
    if (existingDispute) {
      throw new ConflictException('A dispute already exists for this order')
    }

    order.status = OrderStatus.DISPUTED

    const dispute = this.em.create(Dispute, {
      order,
      openedBy: order.buyer,
      reason: data.reason,
    })

    await this.em.flush()

    await this.notificationsService.send({
      user: order.supplier.user,
      type: NotificationType.DISPUTE_OPENED,
      title: 'Litige ouvert',
      body: `Un litige a été ouvert sur la commande ${order.orderNumber}`,
      data: { orderId: order.id, disputeId: dispute.id },
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    })

    return dispute
  }

  @Cron(CronExpression.EVERY_HOUR)
  @EnsureRequestContext()
  async autoCancelUnaccepted(): Promise<void> {
    const cutoff = new Date(Date.now() - TWENTY_FOUR_HOURS_MS)

    const staleOrders = await this.em.find(Order, {
      status: OrderStatus.PLACED,
      createdAt: { $lt: cutoff },
    }, { populate: ['buyer', 'supplier', 'supplier.user'] })

    for (const order of staleOrders) {
      order.status = OrderStatus.CANCELLED

      const payment = await this.em.findOne(Payment, { order: { id: order.id } })
      if (payment && payment.status === PaymentStatus.CAPTURED) {
        payment.status = PaymentStatus.REFUNDED
      }

      await this.notificationsService.send({
        user: order.buyer,
        type: NotificationType.ORDER_CANCELLED,
        title: 'Commande annulée',
        body: `Votre commande ${order.orderNumber} a été annulée car le fournisseur n'a pas répondu dans les 24h`,
        data: { orderId: order.id },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      })

      this.logger.log(`Auto-cancelled order ${order.orderNumber} (no response within 24h)`)
    }

    if (staleOrders.length > 0) {
      await this.em.flush()
    }
  }

  private async validateAndLoadItems(
    items: Array<{ productId: string, variantId?: string, quantity: number }>,
  ): Promise<Map<string, Product>> {
    const productIds = items.map(i => i.productId)
    const products = await this.em.find(Product, { id: { $in: productIds } }, { populate: ['category'] })

    const productMap = new Map<string, Product>()
    for (const product of products) {
      productMap.set(product.id, product)
    }

    for (const item of items) {
      const product = productMap.get(item.productId)
      if (!product) {
        throw new NotFoundException(`Product ${item.productId} not found`)
      }

      const stock = item.variantId
        ? (await this.em.findOne(ProductVariant, { id: item.variantId }))?.stock ?? 0
        : product.stock

      if (stock < item.quantity) {
        throw new BadRequestException(`Insufficient stock for ${product.name}: available ${stock}, requested ${item.quantity}`)
      }
    }

    return productMap
  }

  private async checkDuplicateOrder(
    buyerId: string,
    supplierId: string,
    items: Array<{ productId: string, quantity: number }>,
  ): Promise<void> {
    const twoMinutesAgo = new Date(Date.now() - TWO_MINUTES_MS)

    const recentOrders = await this.em.find(Order, {
      buyer: { id: buyerId },
      supplier: { id: supplierId },
      createdAt: { $gte: twoMinutesAgo },
      status: OrderStatus.PLACED,
    }, { populate: ['items'] })

    for (const recent of recentOrders) {
      const recentItems = recent.items.getItems()
      if (recentItems.length !== items.length)
        continue

      const isMatch = items.every(input =>
        recentItems.some(ri =>
          ri.product.id === input.productId && ri.quantity === input.quantity,
        ),
      )

      if (isMatch) {
        throw new ConflictException(
          `A duplicate order was placed less than 2 minutes ago (${recent.orderNumber})`,
        )
      }
    }
  }

  private async generateOrderNumber(): Promise<string> {
    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
    const prefix = `EB-${dateStr}-`

    const result = await this.em.getConnection().execute(
      `SELECT COUNT(*) as count FROM orders WHERE order_number LIKE ?`,
      [`${prefix}%`],
    )

    const seq = (Number(result[0]?.count ?? 0) + 1).toString().padStart(3, '0')
    return `${prefix}${seq}`
  }

  private verifySupplierOwnership(order: Order, supplierId: string): void {
    if (order.supplier.id !== supplierId) {
      throw new ForbiddenException('This order does not belong to your shop')
    }
  }

  private async getCategorySlug(product: Product): Promise<string> {
    if (product.category?.slug) {
      return product.category.slug
    }
    const loaded = await this.em.findOneOrFail(Product, { id: product.id }, { populate: ['category'] })
    return loaded.category.slug
  }
}
