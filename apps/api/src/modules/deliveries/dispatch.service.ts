import { EnsureRequestContext } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { User } from '../auth/auth.entity'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { CourierProfile } from './entities/courier-profile.entity'
import { DeliveryEvent, DeliveryEventType } from './entities/delivery-event.entity'
import { DeliveryOffer, DeliveryOfferResponse } from './entities/delivery-offer.entity'
import { Delivery, DeliveryStatus, DispatchPhase } from './entities/delivery.entity'

const TEN_MINUTES_MS = 10 * 60 * 1000
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000
const RADIUS_STEP_KM = 5
const RADIUS_CAP_KM = 25
/** Exclusive offer window per courier, then the next one is asked. */
export const OFFER_TIMEOUT_S = 40
/** Targeted rounds before everyone in the radius is asked at once. */
export const TARGETED_ROUNDS = 3
/** Distance assumed for a courier with no usable position (km). */
const UNKNOWN_DISTANCE_KM = 15

interface EligibleCourier {
  id: string
  user_id: string
}

interface CandidateRow {
  id: string
  user_id: string
  distance_km: string | null
  active_deliveries: string
  rating_avg: number | null
  acceptance_rate: string | null
}

export interface RankedCourier {
  id: string
  userId: string
  score: number
  distanceKm: number | null
}

/**
 * Lower is better. Distance dominates; a courier already carrying runs is
 * pushed back; a good rating and a habit of accepting pull forward. Unknown
 * values sit at a neutral middle so new couriers still get asked.
 */
export function scoreCandidate(row: { distanceKm: number | null, activeDeliveries: number, ratingAvg: number | null, acceptanceRate: number | null }): number {
  const distance = row.distanceKm ?? UNKNOWN_DISTANCE_KM
  const rating = row.ratingAvg ?? 3.5
  const acceptance = row.acceptanceRate ?? 0.5
  return distance + 3 * row.activeDeliveries - 0.5 * rating - 2 * acceptance
}

/**
 * Two-phase dispatch. A new run is first offered to one ranked courier at a
 * time (TARGETED, OFFER_TIMEOUT_S each, TARGETED_ROUNDS rounds); when nobody
 * takes it, it falls back to the broadcast where the first to accept wins the
 * atomic claim in DeliveriesService.
 */
@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly notificationsService: NotificationsService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  /**
   * SQL fragment keeping out couriers whose wallet debt passed the platform
   * limit (0 = no limit). Bound as a negative balance floor.
   */
  private async debtFilter(): Promise<{ sql: string, params: number[] }> {
    const limit = await this.platformSettings.getCourierMaxDebt()
    if (limit <= 0) {
      return { sql: '', params: [] }
    }
    return {
      sql: ` AND NOT EXISTS (SELECT 1 FROM wallets w WHERE w.courier_profile_id = cp.id AND w.balance < ?)`,
      params: [-limit],
    }
  }

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

    const debt = await this.debtFilter()
    if (hasLocation[0].has_location) {
      // Fresh live position first; declared zone circle as fallback so a
      // courier who has not opened the app today still gets nearby offers.
      return this.em.getConnection().execute(
        `SELECT cp.id, cp.user_id
         FROM courier_profiles cp, deliveries d
         WHERE d.id = ?
           AND cp.validation_status = 'VALIDATED'
           AND cp.is_available = true${debt.sql}
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
        [deliveryId, ...debt.params],
      )
    }

    return this.em.getConnection().execute(
      `SELECT cp.id, cp.user_id
       FROM courier_profiles cp
       WHERE cp.validation_status = 'VALIDATED' AND cp.is_available = true${debt.sql}`,
      debt.params,
    )
  }

  /**
   * Eligible couriers not yet asked for this run, ranked by scoreCandidate.
   * Acceptance rate = share of answered targeted offers accepted over 30 days.
   */
  async rankCandidates(deliveryId: string): Promise<RankedCourier[]> {
    const eligible = await this.findEligibleCouriers(deliveryId)
    if (eligible.length === 0) {
      return []
    }
    const rows = await this.em.getConnection().execute(
      `SELECT cp.id, cp.user_id, cp.rating_avg,
              CASE WHEN d.pickup_location IS NOT NULL AND l.loc IS NOT NULL
                THEN ROUND((ST_Distance(l.loc, d.pickup_location) / 1000)::numeric, 2)
              END AS distance_km,
              (SELECT COUNT(*) FROM deliveries a
                WHERE a.courier_id = cp.id AND a.status IN ('ACCEPTED', 'PICKED_UP', 'IN_TRANSIT')) AS active_deliveries,
              (SELECT AVG(CASE WHEN o.response = 'ACCEPTED' THEN 1.0 ELSE 0.0 END)
                FROM delivery_offers o
                WHERE o.courier_id = cp.id AND o.responded_at IS NOT NULL
                  AND o.response IN ('ACCEPTED', 'DECLINED', 'EXPIRED')
                  AND o.offered_at > NOW() - INTERVAL '30 days') AS acceptance_rate
       FROM courier_profiles cp
       CROSS JOIN deliveries d
       CROSS JOIN LATERAL (
         SELECT COALESCE(
           CASE WHEN cp.last_location_at > NOW() - INTERVAL '12 hours' THEN cp.last_known_location END,
           CASE WHEN cp.zone_latitude IS NOT NULL
             THEN ST_SetSRID(ST_MakePoint(cp.zone_longitude, cp.zone_latitude), 4326)::geography
           END
         ) AS loc
       ) l
       WHERE d.id = ?
         AND cp.id = ANY(?::uuid[])
         AND NOT EXISTS (SELECT 1 FROM delivery_offers o WHERE o.delivery_id = d.id AND o.courier_id = cp.id)`,
      // knex would expand a JS array into a comma list; Postgres wants the literal form.
      [deliveryId, `{${eligible.map(c => c.id).join(',')}}`],
    ) as CandidateRow[]

    return rows
      .map(row => ({
        id: row.id,
        userId: row.user_id,
        distanceKm: row.distance_km === null ? null : Number(row.distance_km),
        score: scoreCandidate({
          distanceKm: row.distance_km === null ? null : Number(row.distance_km),
          activeDeliveries: Number(row.active_deliveries),
          ratingAvg: row.rating_avg,
          acceptanceRate: row.acceptance_rate === null ? null : Number(row.acceptance_rate),
        }),
      }))
      .sort((a, b) => a.score - b.score)
  }

  /** Entry point for a new or re-opened run: targeted rounds first. */
  async startDispatch(deliveryId: string): Promise<void> {
    const delivery = await this.em.findOne(Delivery, { id: deliveryId })
    if (!delivery || delivery.status !== DeliveryStatus.AWAITING_COURIER) {
      return
    }
    delivery.dispatchPhase = DispatchPhase.TARGETED
    delivery.offerRound = 0
    delivery.offeredToCourier = null
    delivery.offerExpiresAt = null
    await this.em.flush()
    await this.offerNext(deliveryId)
  }

  /**
   * Asks the best remaining courier, or hands the run to the broadcast once
   * the rounds are spent or nobody is left to ask.
   */
  async offerNext(deliveryId: string): Promise<void> {
    const delivery = await this.em.findOne(Delivery, { id: deliveryId }, {
      populate: ['order', 'order.supplier'],
    })
    if (!delivery || delivery.status !== DeliveryStatus.AWAITING_COURIER) {
      return
    }
    if (delivery.offerRound >= TARGETED_ROUNDS) {
      await this.switchToBroadcast(delivery)
      return
    }
    const [best] = await this.rankCandidates(deliveryId)
    if (!best) {
      await this.switchToBroadcast(delivery)
      return
    }

    const round = delivery.offerRound + 1
    const expiresAt = new Date(Date.now() + OFFER_TIMEOUT_S * 1000)
    const courier = this.em.getReference(CourierProfile, best.id)
    this.em.create(DeliveryOffer, { delivery, courier, round, score: best.score, expiresAt })
    delivery.dispatchPhase = DispatchPhase.TARGETED
    delivery.offerRound = round
    delivery.offeredToCourier = courier
    delivery.offerExpiresAt = expiresAt
    this.em.create(DeliveryEvent, {
      delivery,
      type: DeliveryEventType.OFFERED,
      payload: { courierId: best.id, round, score: Math.round(best.score * 100) / 100, distanceKm: best.distanceKm },
    })
    await this.em.flush()

    const user = await this.em.findOne(User, { id: best.userId })
    if (user) {
      await this.notificationsService.send({
        user,
        type: NotificationType.DELIVERY_OFFER,
        title: 'Course proposée en priorité',
        body: `Retrait chez ${delivery.order.supplier.shopName} — répondez dans les ${OFFER_TIMEOUT_S} s`,
        data: { deliveryId: delivery.id, orderId: delivery.order.id, expiresAt: expiresAt.toISOString(), targeted: true },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      })
    }
    this.logger.log(`Offered delivery ${delivery.id} to courier ${best.id} (round ${round}, score ${best.score.toFixed(2)})`)
  }

  /** The targeted courier answered (or the clock ran out): journal and move on. */
  async respondToOffer(deliveryId: string, courierId: string, response: DeliveryOfferResponse): Promise<void> {
    const offer = await this.em.findOne(DeliveryOffer, {
      delivery: { id: deliveryId },
      courier: { id: courierId },
      respondedAt: null,
    }, { orderBy: { offeredAt: 'DESC' } })
    if (!offer) {
      return
    }
    offer.respondedAt = new Date()
    offer.response = response
    const delivery = await this.em.findOne(Delivery, { id: deliveryId })
    if (delivery && delivery.offeredToCourier?.id === courierId && response !== DeliveryOfferResponse.ACCEPTED) {
      delivery.offeredToCourier = null
      delivery.offerExpiresAt = null
      this.em.create(DeliveryEvent, {
        delivery,
        type: response === DeliveryOfferResponse.DECLINED ? DeliveryEventType.OFFER_DECLINED : DeliveryEventType.OFFER_EXPIRED,
        payload: { courierId, round: offer.round },
      })
    }
    await this.em.flush()
    if (response === DeliveryOfferResponse.DECLINED || response === DeliveryOfferResponse.EXPIRED) {
      await this.offerNext(deliveryId)
    }
  }

  /** Closes any pending targeted offer when the run leaves the loop another way. */
  async cancelPendingOffer(deliveryId: string): Promise<void> {
    const pending = await this.em.find(DeliveryOffer, { delivery: { id: deliveryId }, respondedAt: null })
    for (const offer of pending) {
      offer.respondedAt = new Date()
      offer.response = DeliveryOfferResponse.SUPERSEDED
    }
    const delivery = await this.em.findOne(Delivery, { id: deliveryId })
    if (delivery) {
      delivery.offeredToCourier = null
      delivery.offerExpiresAt = null
    }
    await this.em.flush()
  }

  private async switchToBroadcast(delivery: Delivery): Promise<void> {
    delivery.dispatchPhase = DispatchPhase.BROADCAST
    delivery.offeredToCourier = null
    delivery.offerExpiresAt = null
    delivery.offeredAt = new Date()
    await this.em.flush()
    await this.broadcast(delivery.id)
  }

  /** Targeted offers past their window: journal EXPIRED and ask the next courier. */
  async expireOffers(): Promise<void> {
    // Also catches a targeted run left without an open offer (a failed
    // offerNext): it is asked again rather than stranded.
    const expired = await this.em.find(Delivery, {
      status: DeliveryStatus.AWAITING_COURIER,
      dispatchPhase: DispatchPhase.TARGETED,
      $or: [{ offerExpiresAt: { $lt: new Date() } }, { offerExpiresAt: null }],
    }, { populate: ['offeredToCourier'] })
    for (const delivery of expired) {
      const courierId = delivery.offeredToCourier?.id
      if (courierId) {
        await this.respondToOffer(delivery.id, courierId, DeliveryOfferResponse.EXPIRED)
      }
      else {
        await this.offerNext(delivery.id)
      }
    }
  }

  @Cron('*/10 * * * * *')
  @EnsureRequestContext()
  async expireOffersCron(): Promise<void> {
    await this.expireOffers()
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
      dispatchPhase: DispatchPhase.BROADCAST,
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

      await this.startDispatch(delivery.id)
      this.logger.log(`Reassigned delivery ${delivery.id} (courier never picked up)`)
    }
  }
}
