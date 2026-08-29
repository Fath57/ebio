import { EntityManager } from '@mikro-orm/postgresql'
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { UserRole } from '../auth/auth.entity'
import { MediaService } from '../media/media.service'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { ValidationStatus } from '../suppliers/supplier.entity'
import { DispatchService } from './dispatch.service'
import { CourierProfile } from './entities/courier-profile.entity'
import { DeliveryEvent, DeliveryEventType } from './entities/delivery-event.entity'
import { Delivery, DeliveryStatus } from './entities/delivery.entity'

interface ListFilters {
  status?: ValidationStatus
  page?: number
  limit?: number
}

interface DeliveryListFilters {
  status?: DeliveryStatus
  courierId?: string
  page?: number
  limit?: number
}

export interface CourierStats {
  delivered: number
  failed: number
  active: number
}

/** Reviewer-side view of an uploaded document: short-lived signed URL + type. */
export interface CourierDocument {
  url: string
  mimeType: string
  originalName: string
}

/** Back-office side of the shared eBio courier fleet (US4). */
@Injectable()
export class AdminCouriersService {
  private readonly logger = new Logger(AdminCouriersService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly notificationsService: NotificationsService,
    private readonly dispatchService: DispatchService,
    private readonly mediaService: MediaService,
  ) {}

  async list(filters: ListFilters): Promise<{ couriers: CourierProfile[], total: number }> {
    const limit = filters.limit ?? 20
    const offset = ((filters.page ?? 1) - 1) * limit
    const [couriers, total] = await this.em.findAndCount(CourierProfile, {
      ...(filters.status ? { validationStatus: filters.status } : {}),
    }, {
      populate: ['user'],
      orderBy: { createdAt: 'DESC' },
      limit,
      offset,
    })
    return { couriers, total }
  }

  async getById(id: string): Promise<{ profile: CourierProfile, stats: CourierStats, identityDocument: CourierDocument | null }> {
    const profile = await this.em.findOne(CourierProfile, { id }, { populate: ['user'] })
    if (!profile) {
      throw new NotFoundException('Courier profile not found')
    }
    const identityDocument = await this.resolveDocument(profile.identityDocument)
    const rows = await this.em.getConnection().execute(
      `SELECT status, COUNT(*) AS count FROM deliveries WHERE courier_id = ? GROUP BY status`,
      [id],
    ) as Array<{ status: string, count: string }>
    const byStatus = new Map<string, number>(rows.map(r => [r.status, Number(r.count)]))
    return {
      profile,
      identityDocument,
      stats: {
        delivered: byStatus.get(DeliveryStatus.DELIVERED) ?? 0,
        failed: byStatus.get(DeliveryStatus.FAILED) ?? 0,
        active: (byStatus.get(DeliveryStatus.ACCEPTED) ?? 0)
          + (byStatus.get(DeliveryStatus.PICKED_UP) ?? 0)
          + (byStatus.get(DeliveryStatus.IN_TRANSIT) ?? 0),
      },
    }
  }

  async approve(id: string, adminId: string): Promise<CourierProfile> {
    const { profile } = await this.getById(id)
    if (profile.validationStatus === ValidationStatus.VALIDATED) {
      throw new BadRequestException('Ce livreur est déjà validé')
    }

    profile.validationStatus = ValidationStatus.VALIDATED
    profile.rejectionReason = undefined
    profile.validatedAt = new Date()
    profile.validatedBy = adminId
    // Same promotion mechanics as suppliers: the enum role drives CASL.
    if (profile.user.role !== UserRole.ADMIN) {
      profile.user.role = UserRole.COURIER
    }
    await this.em.flush()

    await this.notificationsService.send({
      user: profile.user,
      type: NotificationType.COURIER_VALIDATED,
      title: 'Candidature validée',
      body: 'Bienvenue dans la flotte eBio ! Passez en ligne pour recevoir vos premières courses.',
      data: { courierProfileId: profile.id },
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    })
    this.logger.log(`Courier ${id} approved by admin ${adminId}`)
    return profile
  }

  async reject(id: string, adminId: string, reason: string): Promise<CourierProfile> {
    const { profile } = await this.getById(id)
    profile.validationStatus = ValidationStatus.REJECTED
    profile.rejectionReason = reason
    profile.isAvailable = false
    await this.em.flush()

    await this.notificationsService.send({
      user: profile.user,
      type: NotificationType.COURIER_REJECTED,
      title: 'Candidature refusée',
      body: `Votre candidature de livreur n'a pas été retenue : ${reason}`,
      data: { courierProfileId: profile.id, reason },
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    })
    this.logger.log(`Courier ${id} rejected by admin ${adminId}`)
    return profile
  }

  /**
   * Suspension stops new offers at once and releases claims that have not been
   * picked up. A courier already carrying a package keeps their active run —
   * pulling the delivery back would strand the goods.
   */
  async suspend(id: string, adminId: string): Promise<CourierProfile> {
    const { profile } = await this.getById(id)
    if (profile.validationStatus !== ValidationStatus.VALIDATED) {
      throw new BadRequestException('Seul un livreur validé peut être suspendu')
    }
    profile.validationStatus = ValidationStatus.SUSPENDED
    profile.isAvailable = false

    const claimed = await this.em.find(Delivery, {
      courier: { id },
      status: DeliveryStatus.ACCEPTED,
    })
    for (const delivery of claimed) {
      delivery.courier = null
      delivery.status = DeliveryStatus.AWAITING_COURIER
      delivery.acceptedAt = undefined
      delivery.reassignmentCount += 1
      delivery.offeredAt = new Date()
      this.em.create(DeliveryEvent, {
        delivery,
        type: DeliveryEventType.REASSIGNED,
        actorUserId: adminId,
        payload: { reason: 'COURIER_SUSPENDED' },
      })
    }
    await this.em.flush()
    for (const delivery of claimed) {
      await this.dispatchService.broadcast(delivery.id)
    }

    await this.notificationsService.send({
      user: profile.user,
      type: NotificationType.COURIER_SUSPENDED,
      title: 'Compte suspendu',
      body: 'Votre accès aux courses eBio est suspendu. Contactez l\'équipe eBio pour en savoir plus.',
      data: { courierProfileId: profile.id },
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    })
    this.logger.warn(`Courier ${id} suspended by admin ${adminId} (${claimed.length} delivery released)`)
    return profile
  }

  async reactivate(id: string, adminId: string): Promise<CourierProfile> {
    const { profile } = await this.getById(id)
    if (profile.validationStatus !== ValidationStatus.SUSPENDED) {
      throw new BadRequestException('Ce livreur n\'est pas suspendu')
    }
    profile.validationStatus = ValidationStatus.VALIDATED
    if (profile.user.role !== UserRole.ADMIN) {
      profile.user.role = UserRole.COURIER
    }
    await this.em.flush()

    await this.notificationsService.send({
      user: profile.user,
      type: NotificationType.COURIER_VALIDATED,
      title: 'Compte réactivé',
      body: 'Votre accès aux courses eBio est rétabli. Passez en ligne pour recevoir des courses.',
      data: { courierProfileId: profile.id },
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    })
    this.logger.log(`Courier ${id} reactivated by admin ${adminId}`)
    return profile
  }

  async listDeliveries(filters: DeliveryListFilters): Promise<{ deliveries: Delivery[], total: number }> {
    const limit = filters.limit ?? 20
    const offset = ((filters.page ?? 1) - 1) * limit
    const [deliveries, total] = await this.em.findAndCount(Delivery, {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.courierId ? { courier: { id: filters.courierId } } : {}),
    }, {
      populate: ['order', 'order.buyer', 'order.supplier', 'order.items', 'courier'],
      orderBy: { updatedAt: 'DESC' },
      limit,
      offset,
    })
    return { deliveries, total }
  }

  /**
   * Documents live in a private S3 prefix, referenced by their media id (same
   * convention as Supplier). The reviewer gets a 1h signed URL; a legacy full
   * URL passes through untouched; a missing media row yields null, not a 500.
   */
  private async resolveDocument(value: string | undefined | null): Promise<CourierDocument | null> {
    if (!value) {
      return null
    }
    if (value.startsWith('http')) {
      return { url: value, mimeType: 'application/octet-stream', originalName: 'document' }
    }
    try {
      const media = await this.mediaService.findById(value)
      const url = await this.mediaService.getSignedUrl(value, 3600)
      return { url, mimeType: media.mimeType, originalName: media.originalName }
    }
    catch {
      return null
    }
  }
}
