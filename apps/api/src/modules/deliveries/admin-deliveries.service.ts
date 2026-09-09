import type { Order } from '../orders/entities/order.entity'
import type { CourierCandidate } from './contracts/delivery.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { ValidationStatus } from '../suppliers/supplier.entity'
import { DispatchService } from './dispatch.service'
import { CourierProfile } from './entities/courier-profile.entity'
import { DeliveryEvent, DeliveryEventType } from './entities/delivery-event.entity'
import { Delivery, DeliveryStatus } from './entities/delivery.entity'

/** A live GPS fix older than this falls back to the declared zone centre. */
const FRESH_LOCATION_HOURS = 12
const CANDIDATES_LIMIT = 50

/** Statuses in which the back office may still (re)assign a courier. */
const ASSIGNABLE_STATUSES: readonly DeliveryStatus[] = [DeliveryStatus.AWAITING_COURIER, DeliveryStatus.ACCEPTED]

export interface CandidateFilters {
  /** Name or phone fragment. When set, the radius is ignored: the operator is looking for someone specific. */
  q?: string
  radiusKm?: number
  availableOnly?: boolean
  vehicleType?: string
}

interface CandidateRow {
  id: string
  full_name: string
  phone: string
  vehicle_type: CourierCandidate['vehicleType']
  zone: string
  is_available: boolean
  position_source: 'GPS' | 'ZONE' | null
  latitude: string | null
  longitude: string | null
  last_location_at: Date | string | null
  distance_km: string | null
  active_deliveries: string
  delivered_count: string
}

/**
 * Back-office side of the shared fleet: look at who is around a pickup point
 * and force a courier when the offer/accept loop is too slow or stuck.
 */
@Injectable()
export class AdminDeliveriesService {
  constructor(
    private readonly em: EntityManager,
    private readonly notificationsService: NotificationsService,
    private readonly dispatchService: DispatchService,
  ) {}

  async getById(deliveryId: string): Promise<Delivery> {
    const delivery = await this.em.findOne(Delivery, { id: deliveryId }, {
      populate: ['order', 'order.buyer', 'order.supplier', 'order.items', 'courier', 'courier.user'],
    })
    if (!delivery) {
      throw new NotFoundException('Delivery not found')
    }
    return delivery
  }

  /**
   * Validated couriers ranked by distance to the pickup point. The reference
   * position follows the dispatch rule: fresh GPS first, declared zone centre
   * otherwise, so the operator sees the same picture the broadcast used.
   */
  async findCandidates(deliveryId: string, filters: CandidateFilters): Promise<CourierCandidate[]> {
    const delivery = await this.getById(deliveryId)
    const q = filters.q?.trim()
    const conditions: string[] = [`cp.validation_status = ?`]
    const params: unknown[] = [deliveryId, ValidationStatus.VALIDATED]

    if (filters.availableOnly) {
      conditions.push('cp.is_available = true')
    }
    if (filters.vehicleType) {
      conditions.push('cp.vehicle_type = ?')
      params.push(filters.vehicleType)
    }
    if (q) {
      conditions.push('(cp.full_name ILIKE ? OR cp.phone ILIKE ?)')
      params.push(`%${q}%`, `%${q}%`)
    }
    else if (filters.radiusKm && filters.radiusKm > 0) {
      // Keep position-less couriers out: a radius filter is about proximity.
      conditions.push('ref.loc IS NOT NULL AND d.pickup_location IS NOT NULL AND ST_DWithin(ref.loc, d.pickup_location, ?)')
      params.push(filters.radiusKm * 1000)
    }

    const rows = await this.em.getConnection().execute(
      `WITH d AS (SELECT pickup_location FROM deliveries WHERE id = ?),
       ref AS (
         SELECT cp.id AS courier_id,
                CASE
                  WHEN cp.last_known_location IS NOT NULL
                    AND cp.last_location_at > NOW() - INTERVAL '${FRESH_LOCATION_HOURS} hours'
                    THEN cp.last_known_location
                  WHEN cp.zone_latitude IS NOT NULL
                    THEN ST_SetSRID(ST_MakePoint(cp.zone_longitude, cp.zone_latitude), 4326)::geography
                END AS loc,
                CASE
                  WHEN cp.last_known_location IS NOT NULL
                    AND cp.last_location_at > NOW() - INTERVAL '${FRESH_LOCATION_HOURS} hours'
                    THEN 'GPS'
                  WHEN cp.zone_latitude IS NOT NULL THEN 'ZONE'
                END AS position_source
         FROM courier_profiles cp
       )
       SELECT cp.id, cp.full_name, cp.phone, cp.vehicle_type, cp.zone, cp.is_available,
              ref.position_source,
              ST_Y(ref.loc::geometry) AS latitude,
              ST_X(ref.loc::geometry) AS longitude,
              cp.last_location_at,
              CASE WHEN ref.loc IS NOT NULL AND d.pickup_location IS NOT NULL
                THEN ROUND((ST_Distance(ref.loc, d.pickup_location) / 1000)::numeric, 2)
              END AS distance_km,
              (SELECT COUNT(*) FROM deliveries a
                WHERE a.courier_id = cp.id AND a.status IN ('ACCEPTED', 'PICKED_UP', 'IN_TRANSIT')) AS active_deliveries,
              (SELECT COUNT(*) FROM deliveries a
                WHERE a.courier_id = cp.id AND a.status = 'DELIVERED') AS delivered_count
       FROM courier_profiles cp
       JOIN ref ON ref.courier_id = cp.id
       CROSS JOIN d
       WHERE ${conditions.join(' AND ')}
       ORDER BY distance_km ASC NULLS LAST, cp.full_name ASC
       LIMIT ${CANDIDATES_LIMIT}`,
      params,
    ) as CandidateRow[]

    return rows.map(row => ({
      id: row.id,
      fullName: row.full_name,
      phone: row.phone,
      vehicleType: row.vehicle_type,
      zone: row.zone,
      isAvailable: row.is_available,
      positionSource: row.position_source,
      position: row.latitude != null && row.longitude != null
        ? { latitude: Number(row.latitude), longitude: Number(row.longitude) }
        : null,
      lastLocationAt: row.last_location_at ? new Date(row.last_location_at).toISOString() : null,
      distanceKm: row.distance_km === null ? null : Number(row.distance_km),
      activeDeliveries: Number(row.active_deliveries),
      deliveredCount: Number(row.delivered_count),
      isCurrent: delivery.courier?.id === row.id,
    }))
  }

  /**
   * Force a courier on a delivery. Allowed while nobody has picked the order
   * up yet: an unclaimed run gets its courier, an accepted one changes hands
   * (the released courier is told). The conditional UPDATE is the lock against
   * a courier accepting at the very same moment.
   */
  async assign(deliveryId: string, courierId: string, adminId: string, note?: string): Promise<Delivery> {
    const delivery = await this.getById(deliveryId)
    if (!ASSIGNABLE_STATUSES.includes(delivery.status)) {
      throw new BadRequestException('Cette course ne peut plus être attribuée : elle est déjà en cours ou terminée')
    }

    const courier = await this.em.findOne(CourierProfile, { id: courierId }, { populate: ['user'] })
    if (!courier) {
      throw new NotFoundException('Courier profile not found')
    }
    if (courier.validationStatus !== ValidationStatus.VALIDATED) {
      throw new BadRequestException('Ce livreur n\'est pas validé')
    }
    if (delivery.courier?.id === courier.id) {
      throw new BadRequestException('Ce livreur est déjà sur cette course')
    }

    const released = delivery.courier ?? null

    // Claim and journal in one transaction: a failed event insert must not
    // leave the delivery reassigned without its trace.
    const updated = await this.em.transactional(async (em) => {
      const claimed = await em.getConnection().execute(
        `UPDATE deliveries
         SET courier_id = ?, status = 'ACCEPTED', accepted_at = NOW(),
             reassignment_count = reassignment_count + ?, "updatedAt" = NOW()
         WHERE id = ? AND status IN ('AWAITING_COURIER', 'ACCEPTED')
         RETURNING id`,
        [courier.id, released ? 1 : 0, deliveryId],
        'all',
        em.getTransactionContext(),
      )
      if (claimed.length === 0) {
        throw new ConflictException('La course a changé d\'état entre-temps, rechargez la page')
      }

      // The forked manager has no stale copy: this read reflects the raw UPDATE.
      const fresh = await em.findOne(Delivery, { id: deliveryId }, {
        populate: ['order', 'order.buyer', 'order.supplier', 'order.items', 'courier', 'courier.user'],
      })
      if (!fresh) {
        throw new NotFoundException('Delivery not found')
      }

      if (released) {
        em.create(DeliveryEvent, {
          delivery: fresh,
          type: DeliveryEventType.REASSIGNED,
          actorUserId: adminId,
          payload: { releasedCourierId: released.id, byAdmin: true },
        })
      }
      em.create(DeliveryEvent, {
        delivery: fresh,
        type: DeliveryEventType.ASSIGNED_BY_ADMIN,
        actorUserId: adminId,
        payload: { courierId: courier.id, note: note ?? null },
      })
      return fresh
    })

    await this.notifyAssignment(updated, courier, released, note)
    return updated
  }

  /** Admin counterpart of the supplier's "relancer la diffusion". */
  async rebroadcast(deliveryId: string, adminId: string): Promise<Delivery> {
    const delivery = await this.getById(deliveryId)
    if (delivery.status !== DeliveryStatus.AWAITING_COURIER) {
      throw new BadRequestException('Seule une course sans livreur peut être rediffusée')
    }
    delivery.offeredAt = new Date()
    this.em.create(DeliveryEvent, {
      delivery,
      type: DeliveryEventType.BROADCAST,
      actorUserId: adminId,
      payload: { manual: true, byAdmin: true },
    })
    await this.em.flush()
    await this.dispatchService.broadcast(delivery.id)
    return delivery
  }

  private async notifyAssignment(
    delivery: Delivery,
    courier: CourierProfile,
    released: CourierProfile | null,
    note?: string,
  ): Promise<void> {
    const order = delivery.order
    const orderNumber = order.orderNumber
    const sends: Promise<void>[] = [
      // The courier app shows DELIVERY_ASSIGNED nowhere by default (buyer /
      // supplier type), hence the explicit app targeting for the push.
      this.notificationsService.send({
        user: courier.user,
        type: NotificationType.DELIVERY_ASSIGNED,
        title: 'Course attribuée par eBio',
        body: `${orderNumber} — retrait chez ${order.supplier.shopName}, ${delivery.pickupAddress}${note ? `. ${note}` : ''}`,
        data: { deliveryId: delivery.id, orderId: order.id, assignedByAdmin: 'true' },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
        apps: ['courier'],
      }),
      this.notificationsService.send({
        user: order.buyer,
        type: NotificationType.DELIVERY_ASSIGNED,
        title: 'Livreur en route',
        body: `${courier.fullName} livrera votre commande ${orderNumber}`,
        data: { deliveryId: delivery.id, orderId: order.id },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      }),
    ]

    const supplierUser = await this.resolveSupplierUser(order)
    if (supplierUser) {
      sends.push(this.notificationsService.send({
        user: supplierUser,
        type: NotificationType.DELIVERY_ASSIGNED,
        title: 'Livreur trouvé',
        body: `${courier.fullName} prend en charge la commande ${orderNumber} (attribué par eBio)`,
        data: { deliveryId: delivery.id, orderId: order.id },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      }))
    }

    if (released?.user) {
      sends.push(this.notificationsService.send({
        user: released.user,
        type: NotificationType.DELIVERY_REASSIGNED,
        title: 'Course réattribuée',
        body: `La course ${orderNumber} a été confiée à un autre livreur par eBio.`,
        data: { deliveryId: delivery.id },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      }))
    }

    await Promise.all(sends)
  }

  private async resolveSupplierUser(order: Order): Promise<User | null> {
    const supplier = order.supplier
    if (supplier.user?.email !== undefined) {
      return supplier.user
    }
    const rows = await this.em.getConnection().execute(
      `SELECT user_id FROM suppliers WHERE id = ?`,
      [supplier.id],
    )
    if (rows.length === 0) {
      return null
    }
    return this.em.findOne(User, { id: rows[0].user_id })
  }
}
