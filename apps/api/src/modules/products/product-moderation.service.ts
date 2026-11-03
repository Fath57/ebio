import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { config } from '../../config/env.config'
import { EmailService } from '../email/email.service'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { Product, ProductModeration } from './entities/product.entity'
import { ProductUnitsService } from './product-units.service'

export type ModerationAction = 'approve' | 'reject' | 'withdraw' | 'restore'

/**
 * Which decision may follow which. A refusal is for a product that never went
 * on sale; a withdrawal for one that did. Restoring puts either back on sale.
 */
const TRANSITIONS: Record<ModerationAction, { from: ProductModeration[], to: ProductModeration }> = {
  approve: { from: [ProductModeration.PENDING, ProductModeration.REJECTED], to: ProductModeration.APPROVED },
  reject: { from: [ProductModeration.PENDING], to: ProductModeration.REJECTED },
  withdraw: { from: [ProductModeration.APPROVED], to: ProductModeration.WITHDRAWN },
  restore: { from: [ProductModeration.WITHDRAWN], to: ProductModeration.APPROVED },
}

/**
 * eBio's decisions on products, and the e-mail sent when one is created.
 *
 * Kept apart from ProductsService, which acts for the shop: everything here
 * acts against or above it, and is never reachable from a shop's session.
 */
@Injectable()
export class ProductModerationService {
  private readonly logger = new Logger(ProductModerationService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly platformSettings: PlatformSettingsService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
    private readonly productUnits: ProductUnitsService,
  ) {}

  /** The moderation state a product starts in, read from the settings. */
  async initialStatus(): Promise<ProductModeration> {
    return await this.platformSettings.getProductApprovalRequired()
      ? ProductModeration.PENDING
      : ProductModeration.APPROVED
  }

  /**
   * Tells the configured addresses that a product was added.
   *
   * Never throws: the product is already saved, and a mail server that is
   * down must not turn the shop's save into an error.
   */
  async announceNewProduct(product: Product): Promise<void> {
    try {
      const recipients = await this.platformSettings.getNewProductAlertEmails()
      if (recipients.length === 0) {
        return
      }
      const pending = product.moderationStatus === ProductModeration.PENDING
      const unit = await this.unitLabel(product.unit)
      const subject = pending
        ? `Nouveau produit à valider : ${product.name}`
        : `Nouveau produit sur eBio : ${product.name}`
      await Promise.all(recipients.map(async (to) => {
        try {
          await this.email.sendTemplatedEmail({
            to,
            subject,
            template: 'product-new',
            data: {
              pending,
              productName: product.name,
              shopName: product.supplier.shopName,
              price: product.pricePerUnit,
              unit,
              reviewUrl: `${config.clients.webApp.url}/admin/produits/${product.id}`,
            },
          })
        }
        catch (error) {
          this.logger.error(`New product e-mail to ${to} failed`, error instanceof Error ? error.message : String(error))
        }
      }))
    }
    catch (error) {
      this.logger.error('New product announcement failed', error instanceof Error ? error.stack : String(error))
    }
  }

  /** Applies an eBio decision and tells the shop. */
  async decide(productId: string, action: ModerationAction, reason?: string): Promise<Product> {
    const product = await this.em.findOne(Product, { id: productId }, { populate: ['supplier', 'supplier.user'] })
    if (!product) {
      throw new NotFoundException('Product not found')
    }

    const transition = TRANSITIONS[action]
    if (!transition.from.includes(product.moderationStatus)) {
      throw new BadRequestException(`Action impossible : le produit est au statut ${product.moderationStatus}`)
    }
    const trimmed = reason?.trim()
    // The shop cannot fix what it is not told about.
    if ((action === 'reject' || action === 'withdraw') && !trimmed) {
      throw new BadRequestException('Indiquez le motif : il est transmis à la boutique')
    }

    product.moderationStatus = transition.to
    product.moderationReason = transition.to === ProductModeration.APPROVED ? undefined : trimmed
    product.moderatedAt = new Date()
    await this.em.flush()

    await this.tellShop(product, action, trimmed)
    return product
  }

  /**
   * A shop editing a refused product sends it back for review: correcting it
   * is the only answer a refusal asks for. A withdrawal stays as it is — eBio
   * alone lifts it.
   */
  resubmitIfRejected(product: Product): void {
    if (product.moderationStatus === ProductModeration.REJECTED) {
      product.moderationStatus = ProductModeration.PENDING
    }
  }

  private async tellShop(product: Product, action: ModerationAction, reason?: string): Promise<void> {
    const user = product.supplier.user
    if (!user) {
      return
    }
    const messages: Record<ModerationAction, { title: string, body: string }> = {
      approve: { title: 'Produit validé', body: `« ${product.name} » est maintenant visible des acheteurs.` },
      reject: { title: 'Produit refusé', body: `« ${product.name} » n’a pas été validé. Motif : ${reason}. Corrigez-le pour le soumettre à nouveau.` },
      withdraw: { title: 'Produit retiré par eBio', body: `« ${product.name} » n’est plus visible des acheteurs. Motif : ${reason}.` },
      restore: { title: 'Produit remis en ligne', body: `« ${product.name} » est de nouveau visible des acheteurs.` },
    }
    try {
      await this.notifications.send({
        user,
        type: NotificationType.SYSTEM,
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
        title: messages[action].title,
        body: messages[action].body,
        data: { type: 'product_moderation', productId: product.id },
      })
    }
    catch (error) {
      this.logger.error(`Moderation notice for product ${product.id} failed`, error instanceof Error ? error.message : String(error))
    }
  }

  private async unitLabel(code: string): Promise<string> {
    try {
      const { items } = await this.productUnits.findAll(true)
      const unit = items.find(item => item.code === code)
      return unit?.label.trim().toLowerCase() ?? ''
    }
    catch {
      return ''
    }
  }
}
