import type { ApproveBannerRequest, BannerRequestResponse, CreateBannerRequest, RejectBannerRequest } from './contracts/banner.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { Product } from '../products/entities/product.entity'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { StaffInboxService } from '../staff-inbox/staff-inbox.service'
import { Supplier } from '../suppliers/supplier.entity'
import { WalletTransactionType } from '../wallet/entities/wallet-transaction.entity'
import { WalletService } from '../wallet/wallet.service'
import { BannerRequest, BannerRequestStatus } from './banner-request.entity'
import { Banner, BannerTargetType } from './banner.entity'

/**
 * Paid banner slots. The shop pays when filing (wallet debit — a short
 * balance is refused with the usual "Solde insuffisant" so the app offers a
 * top-up); eBio then approves, which publishes the banner for the paid
 * duration, or rejects, which refunds in full. Cancelling a pending request
 * refunds too.
 */
@Injectable()
export class BannerRequestsService {
  constructor(
    private readonly em: EntityManager,
    private readonly walletService: WalletService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly notifications: NotificationsService,
    private readonly staffInbox: StaffInboxService,
  ) {}

  async listForSupplier(supplierId: string): Promise<BannerRequestResponse[]> {
    const rows = await this.em.find(BannerRequest, { supplier: { id: supplierId } }, { populate: ['supplier', 'banner'], orderBy: { createdAt: 'DESC' } })
    return this.toResponses(rows)
  }

  async listAll(status?: BannerRequestStatus): Promise<BannerRequestResponse[]> {
    const rows = await this.em.find(BannerRequest, status ? { status } : {}, { populate: ['supplier', 'banner'], orderBy: { createdAt: 'DESC' } })
    return this.toResponses(rows)
  }

  async create(supplierId: string, data: CreateBannerRequest): Promise<BannerRequestResponse> {
    const supplier = await this.em.findOneOrFail(Supplier, { id: supplierId })
    const offer = (await this.platformSettings.getBannerOffers()).offers.find(o => o.days === data.durationDays)
    if (!offer) {
      throw new BadRequestException('Cette durée ne fait pas partie des offres proposées')
    }
    const targetType = data.targetType as BannerTargetType
    const targetId = targetType === BannerTargetType.PRODUCT ? data.targetId : supplier.id
    if (targetType === BannerTargetType.PRODUCT) {
      const product = targetId ? await this.em.findOne(Product, { id: targetId, supplier: { id: supplier.id } }) : null
      if (!product) {
        throw new BadRequestException('Le produit choisi doit appartenir à votre boutique')
      }
    }
    const pending = await this.em.count(BannerRequest, { supplier: { id: supplier.id }, status: BannerRequestStatus.PENDING })
    if (pending >= 3) {
      throw new ConflictException('Vous avez déjà trois demandes en attente')
    }

    const request = this.em.create(BannerRequest, {
      supplier,
      title: data.title,
      subtitle: data.subtitle ?? null,
      imageUrl: data.imageUrl,
      targetType,
      targetId,
      durationDays: offer.days,
      price: offer.price,
      requestedStartAt: data.requestedStartAt ? new Date(data.requestedStartAt) : null,
    })
    await this.em.flush()

    // Pay first: a request that cannot be paid does not exist.
    if (offer.price > 0) {
      const wallet = await this.walletService.getOrCreate({ supplierId: supplier.id })
      try {
        await this.walletService.debit(wallet.id, {
          type: WalletTransactionType.BANNER_PAYMENT,
          amount: offer.price,
          description: `Bannière sponsorisée ${offer.days} jours — « ${data.title} »`,
        })
      }
      catch (error) {
        await this.em.nativeDelete(BannerRequest, { id: request.id })
        throw error
      }
    }
    request.paidAt = new Date()
    await this.em.flush()
    // The team is told at once: the slot is paid and expected within a day.
    void this.staffInbox.notifyNewBannerRequest({ shopName: supplier.shopName, title: data.title, durationDays: offer.days, price: offer.price })
    return this.findOne(request.id)
  }

  async cancel(supplierId: string, requestId: string): Promise<BannerRequestResponse> {
    const request = await this.load(requestId)
    if (request.supplier.id !== supplierId) {
      throw new NotFoundException('Demande introuvable')
    }
    if (request.status !== BannerRequestStatus.PENDING) {
      throw new ConflictException('Seule une demande en attente peut être annulée')
    }
    request.status = BannerRequestStatus.CANCELLED
    await this.refund(request, 'Annulation de votre demande de bannière')
    await this.em.flush()
    return this.findOne(request.id)
  }

  async approve(requestId: string, adminId: string, data: ApproveBannerRequest): Promise<BannerRequestResponse> {
    const request = await this.load(requestId)
    if (request.status !== BannerRequestStatus.PENDING) {
      throw new ConflictException('Cette demande a déjà été traitée')
    }
    const startsAt = data.startsAt ? new Date(data.startsAt) : request.requestedStartAt && request.requestedStartAt > new Date() ? request.requestedStartAt : new Date()
    const endsAt = new Date(startsAt.getTime() + request.durationDays * 86_400_000)
    const banner = this.em.create(Banner, {
      title: request.title,
      subtitle: request.subtitle ?? undefined,
      imageUrl: request.imageUrl,
      targetType: request.targetType,
      targetId: request.targetId ?? undefined,
      supplier: request.supplier,
      sponsored: true,
      startsAt,
      endsAt,
      position: data.position ?? 0,
    })
    request.banner = banner
    request.status = BannerRequestStatus.APPROVED
    request.reviewedBy = adminId
    request.reviewedAt = new Date()
    await this.em.flush()
    await this.notify(request, NotificationType.BANNER_APPROVED, 'Bannière approuvée', `Votre bannière « ${request.title} » sera diffusée du ${startsAt.toLocaleDateString('fr-FR')} au ${endsAt.toLocaleDateString('fr-FR')}.`)
    return this.findOne(request.id)
  }

  async reject(requestId: string, adminId: string, data: RejectBannerRequest): Promise<BannerRequestResponse> {
    const request = await this.load(requestId)
    if (request.status !== BannerRequestStatus.PENDING) {
      throw new ConflictException('Cette demande a déjà été traitée')
    }
    request.status = BannerRequestStatus.REJECTED
    request.rejectionReason = data.reason
    request.reviewedBy = adminId
    request.reviewedAt = new Date()
    await this.refund(request, `Bannière refusée — ${data.reason}`)
    await this.em.flush()
    await this.notify(request, NotificationType.BANNER_REJECTED, 'Bannière refusée', `Votre demande « ${request.title} » a été refusée : ${data.reason}. Le montant a été remboursé sur votre portefeuille.`)
    return this.findOne(request.id)
  }

  private async refund(request: BannerRequest, description: string): Promise<void> {
    if (request.refundedAt || request.price <= 0 || !request.paidAt) {
      return
    }
    const wallet = await this.walletService.getOrCreate({ supplierId: request.supplier.id })
    await this.walletService.credit(wallet.id, { type: WalletTransactionType.BANNER_REFUND, amount: request.price, description })
    request.refundedAt = new Date()
  }

  private async notify(request: BannerRequest, type: NotificationType, title: string, body: string): Promise<void> {
    try {
      const supplier = await this.em.findOneOrFail(Supplier, { id: request.supplier.id }, { populate: ['user'] })
      const user = await this.em.findOneOrFail(User, { id: supplier.user.id })
      await this.notifications.send({ user, type, title, body, data: { bannerRequestId: request.id }, channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP], apps: ['supplier'] })
    }
    catch {
      // A missing push token must not fail the review.
    }
  }

  private async load(id: string): Promise<BannerRequest> {
    const request = await this.em.findOne(BannerRequest, { id }, { populate: ['supplier', 'banner'] })
    if (!request) {
      throw new NotFoundException('Demande introuvable')
    }
    return request
  }

  private async findOne(id: string): Promise<BannerRequestResponse> {
    const [response] = await this.toResponses([await this.load(id)])
    return response
  }

  private async toResponses(rows: BannerRequest[]): Promise<BannerRequestResponse[]> {
    const productIds = rows.filter(r => r.targetType === BannerTargetType.PRODUCT && r.targetId).map(r => r.targetId as string)
    const products = productIds.length > 0 ? await this.em.find(Product, { id: { $in: productIds } }) : []
    const productNames = new Map(products.map(p => [p.id, p.name]))
    return rows.map(r => ({
      id: r.id,
      supplierId: r.supplier.id,
      supplierName: r.supplier.shopName,
      title: r.title,
      subtitle: r.subtitle ?? null,
      imageUrl: r.imageUrl,
      targetType: r.targetType as 'SUPPLIER' | 'PRODUCT',
      targetId: r.targetId ?? null,
      targetLabel: r.targetType === BannerTargetType.PRODUCT ? productNames.get(r.targetId ?? '') ?? null : r.supplier.shopName,
      durationDays: r.durationDays,
      price: r.price,
      requestedStartAt: r.requestedStartAt?.toISOString() ?? null,
      status: r.status,
      rejectionReason: r.rejectionReason ?? null,
      banner: r.banner
        ? {
            id: r.banner.id,
            startsAt: r.banner.startsAt?.toISOString() ?? null,
            endsAt: r.banner.endsAt?.toISOString() ?? null,
            isActive: r.banner.isActive,
            impressions: r.banner.impressions,
            clicks: r.banner.clicks,
          }
        : null,
      paidAt: r.paidAt?.toISOString() ?? null,
      refundedAt: r.refundedAt?.toISOString() ?? null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }))
  }
}
