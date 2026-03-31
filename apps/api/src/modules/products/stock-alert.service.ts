import { EntityManager } from '@mikro-orm/postgresql'
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { Product } from './entities/product.entity'
import { StockAlert } from './entities/stock-alert.entity'

@Injectable()
export class StockAlertService {
  constructor(
    private readonly em: EntityManager,
    private readonly notificationsService: NotificationsService,
  ) {}

  async subscribe(userId: string, productId: string): Promise<StockAlert> {
    const existing = await this.em.findOne(StockAlert, {
      buyer: { id: userId },
      product: { id: productId },
    })
    if (existing) {
      throw new ConflictException('Already subscribed to stock alerts for this product')
    }

    const product = await this.em.findOne(Product, { id: productId })
    if (!product) {
      throw new NotFoundException('Product not found')
    }

    const buyer = await this.em.findOneOrFail(User, { id: userId })

    const alert = this.em.create(StockAlert, {
      buyer,
      product,
    })

    await this.em.flush()
    return alert
  }

  async notifyOnRestock(productId: string): Promise<void> {
    const alerts = await this.em.find(StockAlert, {
      product: { id: productId },
      notifiedAt: null,
    }, {
      populate: ['buyer', 'product'],
    })

    for (const alert of alerts) {
      await this.notificationsService.send({
        user: alert.buyer,
        type: NotificationType.STOCK_AVAILABLE,
        title: 'Produit de nouveau disponible',
        body: `Le produit "${alert.product.name}" est de nouveau en stock !`,
        data: { productId },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      })

      alert.notifiedAt = new Date()
    }

    await this.em.flush()
  }

  async checkStockThreshold(product: Product): Promise<void> {
    if (product.stock > 0 && product.stock <= product.stockAlertThreshold) {
      const supplier = await this.em.findOne(
        Product,
        { id: product.id },
        { populate: ['supplier.user'] },
      )
      if (supplier?.supplier?.user) {
        await this.notificationsService.send({
          user: supplier.supplier.user,
          type: NotificationType.STOCK_ALERT,
          title: 'Alerte stock bas',
          body: `Le produit "${product.name}" n'a plus que ${product.stock} unites en stock.`,
          data: { productId: product.id, currentStock: product.stock },
          channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
        })
      }
    }
  }
}
