import type {
  AnnouncementRequestInput,
  ApproveAnnouncementInput,
  PlatformAnnouncementInput,
} from './contracts/announcement.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { BannerTargetType } from '../banners/banner.entity'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { Supplier } from '../suppliers/supplier.entity'
import { WalletTransactionType } from '../wallet/entities/wallet-transaction.entity'
import { PlatformAccount } from '../wallet/entities/wallet.entity'
import { WalletService } from '../wallet/wallet.service'
import { AnnouncementRequest, AnnouncementRequestStatus } from './announcement-request.entity'
import { Announcement, AnnouncementOrigin } from './announcement.entity'

const MAX_PENDING_PER_SHOP = 3

/**
 * Comment nommer une annonce qui n'a pas de titre.
 *
 * Un visuel seul n'en porte pas, mais le relevé du portefeuille et la file du
 * back-office ont besoin de la désigner. « Visuel » est ce que la boutique
 * lira sur sa ligne de débit.
 */
function labelOf(title: string | null | undefined): string {
  return (title ?? '').trim().length > 0 ? (title as string) : 'Visuel'
}

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly em: EntityManager,
    private readonly settings: PlatformSettingsService,
    private readonly walletService: WalletService,
  ) {}

  /**
   * L'annonce à montrer maintenant, s'il y en a une.
   *
   * Une seule : deux modaux l'un après l'autre, personne ne lit le second. La
   * plus prioritaire parmi celles en cours que l'acheteur n'a pas vues depuis
   * l'intervalle réglé — une annonce qui revient à chaque ouverture cesse
   * d'être lue au bout de deux fois.
   */
  async currentFor(userId: string): Promise<Announcement | null> {
    const intervalHours = await this.settings.getAnnouncementIntervalHours()

    const rows = await this.em.getConnection().execute<Array<{ id: string }>>(
      `SELECT a.id
       FROM announcements a
       LEFT JOIN announcement_views v
         ON v.announcement_id = a.id AND v.user_id = ?
       WHERE a.active = true
         AND a.starts_at <= NOW()
         AND a.ends_at >= NOW()
         AND (v.seen_at IS NULL OR v.seen_at <= NOW() - (? * INTERVAL '1 hour'))
       ORDER BY a.priority DESC, a.starts_at
       LIMIT 1`,
      [userId, intervalHours],
    )

    const found = rows[0]
    if (!found) {
      return null
    }
    return this.em.findOne(Announcement, { id: found.id }, { populate: ['supplier'] })
  }

  /**
   * Noter qu'elle a été vue.
   *
   * Écrit en une instruction : l'application peut très bien envoyer deux fois
   * le même signal, et deux lignes pour un même couple n'auraient aucun sens.
   */
  async markSeen(userId: string, announcementId: string): Promise<void> {
    await this.em.getConnection().execute(
      `INSERT INTO announcement_views (announcement_id, user_id, seen_at, times)
       VALUES (?, ?, NOW(), 1)
       ON CONFLICT (announcement_id, user_id)
       DO UPDATE SET seen_at = NOW(), times = announcement_views.times + 1`,
      [announcementId, userId],
    )
  }

  // ─── Demandes des boutiques ────────────────────────────────────────────────

  async requestForSupplier(supplierId: string, data: AnnouncementRequestInput): Promise<AnnouncementRequest> {
    const supplier = await this.em.findOne(Supplier, { id: supplierId })
    if (!supplier) {
      throw new NotFoundException('Boutique introuvable')
    }

    const { offers } = await this.settings.getAnnouncementOffers()
    const offer = offers.find(candidate => candidate.days === data.durationDays)
    if (!offer) {
      throw new BadRequestException('Cette durée n\'est pas proposée')
    }

    const pending = await this.em.count(AnnouncementRequest, {
      supplier: { id: supplierId },
      status: AnnouncementRequestStatus.PENDING,
    })
    if (pending >= MAX_PENDING_PER_SHOP) {
      throw new ConflictException('Vous avez déjà trois demandes en attente')
    }

    const request = this.em.create(AnnouncementRequest, {
      supplier,
      title: data.title ?? null,
      subtitle: data.subtitle ?? null,
      imageUrl: data.imageUrl ?? null,
      targetType: data.targetType as BannerTargetType,
      targetId: data.targetId ?? null,
      durationDays: offer.days,
      price: offer.price,
    })
    await this.em.flush()

    // Payer d'abord : une demande qu'on ne peut pas payer n'existe pas.
    if (offer.price > 0) {
      const wallet = await this.walletService.getOrCreate({ supplierId })
      try {
        await this.walletService.debit(wallet.id, {
          type: WalletTransactionType.BANNER_PAYMENT,
          amount: offer.price,
          description: `Annonce ${offer.days} jour(s) — « ${labelOf(data.title)} »`,
        })
      }
      catch (error) {
        await this.em.nativeDelete(AnnouncementRequest, { id: request.id })
        throw error
      }
      await this.walletService.post(PlatformAccount.BANNERS, 'credit', {
        type: WalletTransactionType.PLATFORM_BANNER,
        amount: offer.price,
        description: `Annonce ${offer.days} jour(s) — ${supplier.shopName}`,
      })
    }

    request.paidAt = new Date()
    await this.em.flush()
    return request
  }

  async listRequestsForSupplier(supplierId: string): Promise<AnnouncementRequest[]> {
    return this.em.find(
      AnnouncementRequest,
      { supplier: { id: supplierId } },
      { orderBy: { createdAt: 'DESC' }, populate: ['announcement'] },
    )
  }

  async cancelRequest(supplierId: string, requestId: string): Promise<AnnouncementRequest> {
    const request = await this.loadRequest(requestId)
    if (request.supplier.id !== supplierId) {
      throw new NotFoundException('Demande introuvable')
    }
    if (request.status !== AnnouncementRequestStatus.PENDING) {
      throw new ConflictException('Seule une demande en attente peut être annulée')
    }

    request.status = AnnouncementRequestStatus.CANCELLED
    await this.refund(request, 'Annulation de votre demande d\'annonce')
    await this.em.flush()
    return request
  }

  // ─── Back-office ───────────────────────────────────────────────────────────

  async listRequests(status?: AnnouncementRequestStatus): Promise<AnnouncementRequest[]> {
    return this.em.find(
      AnnouncementRequest,
      status ? { status } : {},
      { orderBy: { createdAt: 'DESC' }, populate: ['supplier', 'announcement'] },
    )
  }

  /**
   * Approuver : la demande devient une annonce qui court.
   *
   * La durée payée commence au démarrage choisi, et non au dépôt — une
   * boutique qui attend trois jours d'approbation ne doit pas les perdre.
   */
  async approveRequest(requestId: string, data: ApproveAnnouncementInput): Promise<AnnouncementRequest> {
    const request = await this.loadRequest(requestId)
    if (request.status !== AnnouncementRequestStatus.PENDING) {
      throw new ConflictException('Cette demande a déjà été traitée')
    }

    const startsAt = data.startsAt ? new Date(data.startsAt) : new Date()
    const endsAt = new Date(startsAt.getTime() + request.durationDays * 24 * 60 * 60 * 1000)

    const announcement = this.em.create(Announcement, {
      title: request.title ?? null,
      subtitle: request.subtitle ?? null,
      imageUrl: request.imageUrl ?? null,
      targetType: request.targetType,
      targetId: request.targetId ?? null,
      origin: AnnouncementOrigin.SUPPLIER,
      supplier: request.supplier,
      startsAt,
      endsAt,
      priority: data.priority ?? 0,
    })

    request.status = AnnouncementRequestStatus.APPROVED
    request.announcement = announcement
    await this.em.flush()
    return request
  }

  async rejectRequest(requestId: string, reason: string): Promise<AnnouncementRequest> {
    const request = await this.loadRequest(requestId)
    if (request.status !== AnnouncementRequestStatus.PENDING) {
      throw new ConflictException('Cette demande a déjà été traitée')
    }

    request.status = AnnouncementRequestStatus.REJECTED
    request.rejectionReason = reason
    await this.refund(request, `Annonce refusée — ${reason}`)
    await this.em.flush()
    return request
  }

  async listAnnouncements(): Promise<Announcement[]> {
    return this.em.find(Announcement, {}, { orderBy: { startsAt: 'DESC' }, populate: ['supplier'] })
  }

  async createPlatformAnnouncement(data: PlatformAnnouncementInput): Promise<Announcement> {
    const startsAt = new Date(data.startsAt)
    const endsAt = new Date(data.endsAt)
    if (endsAt <= startsAt) {
      throw new BadRequestException('La fin doit suivre le début')
    }

    const announcement = this.em.create(Announcement, {
      title: data.title ?? null,
      subtitle: data.subtitle ?? null,
      imageUrl: data.imageUrl ?? null,
      targetType: data.targetType as BannerTargetType,
      targetId: data.targetId ?? null,
      origin: AnnouncementOrigin.PLATFORM,
      supplier: null,
      startsAt,
      endsAt,
      priority: data.priority ?? 0,
      active: data.active ?? true,
    })
    await this.em.flush()
    return announcement
  }

  /**
   * Éteindre plutôt que supprimer.
   *
   * Une annonce payée laisse une trace : sa demande la référence, et les vues
   * comptées disent ce que la boutique a eu pour son argent.
   */
  async setActive(id: string, active: boolean): Promise<Announcement> {
    const announcement = await this.em.findOne(Announcement, { id })
    if (!announcement) {
      throw new NotFoundException('Annonce introuvable')
    }
    announcement.active = active
    await this.em.flush()
    return announcement
  }

  private async loadRequest(id: string): Promise<AnnouncementRequest> {
    const request = await this.em.findOne(AnnouncementRequest, { id }, { populate: ['supplier'] })
    if (!request) {
      throw new NotFoundException('Demande introuvable')
    }
    return request
  }

  /** Rembourser ce qui n'a pas été diffusé. */
  private async refund(request: AnnouncementRequest, description: string): Promise<void> {
    if (request.paidAt === null || request.paidAt === undefined || request.price <= 0) {
      return
    }

    const wallet = await this.walletService.getOrCreate({ supplierId: request.supplier.id })
    await this.walletService.credit(wallet.id, {
      type: WalletTransactionType.BANNER_PAYMENT,
      amount: request.price,
      description,
    })
    await this.walletService.post(PlatformAccount.BANNERS, 'debit', {
      type: WalletTransactionType.PLATFORM_BANNER,
      amount: request.price,
      description: `Remboursement annonce — ${request.supplier.shopName}`,
    })
  }
}
