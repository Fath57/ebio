import { EnsureRequestContext } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { User } from '../auth/auth.entity'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { DeliveryEvent, DeliveryEventType } from './entities/delivery-event.entity'
import { Delivery, DeliveryStatus } from './entities/delivery.entity'

const TEN_MINUTES_MS = 10 * 60 * 1000
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000
const RADIUS_STEP_KM = 5
const RADIUS_CAP_KM = 25

interface EligibleCourier {
  id: string
  user_id: string
}

/**
 * Broadcast-and-accept dispatch: offers are pushed to nearby available
 * couriers, the first who accepts wins the atomic claim in DeliveriesService.
 */
@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Validated + available couriers with a fresh (<12h) position inside the
   * delivery's current radius. A delivery without a pickup location falls back
   * to every available courier, distance-free.
   */
  async findEligibleCouriers(deliveryId: string): Promise<EligibleCourier[]> {
    const hasLocation = await this.em.getConnection().execute(
      `SELECT pickup_location IS NOT NULL AS has_location FROM deliveries WHERE id = ?`,
      [deliveryId],
    )
    if (hasLocation.length === 0) {
      return []
    }

    if (hasLocation[0].has_location) {
      // Fresh live position first; declared zone circle as fallback so a
      // courier who has not opened the app today still gets nearby offers.
      return this.em.getConnection().execute(
        `SELECT cp.id, cp.user_id
         FROM courier_profiles cp, deliveries d
         WHERE d.id = ?
           AND cp.validation_status = 'VALIDATED'
           AND cp.is_available = true
           AND (
             (cp.last_known_location IS NOT NULL
               AND cp.last_location_at > NOW() - INTERVAL '12 hours'
               AND ST_DWithin(cp.last_known_location, d.pickup_location, d.broadcast_radius_km * 1000))
             OR (
               (cp.last_known_location IS NULL OR cp.last_location_at <= NOW() - INTERVAL '12 hours')
               AND cp.zone_latitude IS NOT NULL
               AND ST_DWithin(
                 ST_SetSRID(ST_MakePoint(cp.zone_longitude, cp.zone_latitude), 4326)::geography,
                 d.pickup_location,
                 GREATEST(d.broadcast_radius_km * 1000, COALESCE(cp.zone_radius_km, 0) * 1000)
               )
             )
           )`,
        [deliveryId],
      )
    }

    return this.em.getConnection().execute(
      `SELECT cp.id, cp.user_id
       FROM courier_profiles cp
       WHERE cp.validation_status = 'VALIDATED' AND cp.is_available = true`,
      [],
    )
  }

  /** Pushes the offer to eligible couriers and journals the broadcast. */
  async broadcast(deliveryId: string): Promise<number> {
    const delivery = await this.em.findOne(Delivery, { id: deliveryId }, {
      populate: ['order', 'order.supplier'],
    })
    if (!delivery || delivery.status !== DeliveryStatus.AWAITING_COURIER) {
      return 0
    }

    const couriers = await this.findEligibleCouriers(deliveryId)
    const users = couriers.length > 0
      ? await this.em.find(User, { id: { $in: couriers.map(c => c.user_id) } })
      : []

    await Promise.all(users.map(user => this.notificationsService.send({
      user,
      type: NotificationType.DELIVERY_OFFER,
      title: 'Nouvelle course disponible',
      body: `Retrait chez ${delivery.order.supplier.shopName} — ${delivery.pickupAddress}`,
      data: { deliveryId: delivery.id, orderId: delivery.order.id },
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    })))

    this.em.create(DeliveryEvent, {
      delivery,
      type: DeliveryEventType.BROADCAST,
      payload: { radiusKm: delivery.broadcastRadiusKm, notifiedCouriers: users.length },
    })
    await this.em.flush()

    this.logger.log(`Broadcast delivery ${delivery.id} to ${users.length} courier(s) (radius ${delivery.broadcastRadiusKm} km)`)
    return users.length
  }

  /** Cron wrapper — the request-context decorator needs a real EntityManager. */
  @Cron('*/2 * * * *')
  @EnsureRequestContext()
  async rebroadcastStaleCron(): Promise<void> {
    await this.rebroadcastStale()
  }

  @Cron('*/2 * * * *')
  @EnsureRequestContext()
  async reassignStuckCron(): Promise<void> {
    await this.reassignStuck()
  }

  /** Unclaimed after 10 min: widen the radius (cap 25 km) and push again. */
  async rebroadcastStale(): Promise<void> {
    const cutoff = new Date(Date.now() - TEN_MINUTES_MS)
    const stale = await this.em.find(Delivery, {
      status: DeliveryStatus.AWAITING_COURIER,
      offeredAt: { $lt: cutoff },
    })

    for (const delivery of stale) {
      delivery.broadcastRadiusKm = Math.min(delivery.broadcastRadiusKm + RADIUS_STEP_KM, RADIUS_CAP_KM)
      delivery.offeredAt = new Date()
      await this.em.flush()
      await this.broadcast(delivery.id)
    }
  }

  /** Accepted but never picked up within 15 min: release and re-offer. */
  async reassignStuck(): Promise<void> {
    const cutoff = new Date(Date.now() - FIFTEEN_MINUTES_MS)
    const stuck = await this.em.find(Delivery, {
      status: DeliveryStatus.ACCEPTED,
      acceptedAt: { $lt: cutoff },
    }, { populate: ['courier', 'courier.user', 'order'] })

    for (const delivery of stuck) {
      const releasedCourier = delivery.courier
      delivery.courier = null
      delivery.status = DeliveryStatus.AWAITING_COURIER
      delivery.acceptedAt = undefined
      delivery.reassignmentCount += 1
      delivery.offeredAt = new Date()

      this.em.create(DeliveryEvent, {
        delivery,
        type: DeliveryEventType.REASSIGNED,
        payload: { releasedCourierId: releasedCourier?.id ?? null },
      })
      await this.em.flush()

      if (releasedCourier) {
        await this.notificationsService.send({
          user: releasedCourier.user,
          type: NotificationType.DELIVERY_REASSIGNED,
          title: 'Course réattribuée',
          body: `La course ${delivery.order.orderNumber} a été réattribuée : le retrait n'a pas été effectué à temps.`,
          data: { deliveryId: delivery.id },
          channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
        })
      }

      await this.broadcast(delivery.id)
      this.logger.log(`Reassigned delivery ${delivery.id} (courier never picked up)`)
    }
  }
}
