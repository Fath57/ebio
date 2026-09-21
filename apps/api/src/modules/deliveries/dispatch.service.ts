import { EnsureRequestContext } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { computeCourierFee, orderPickups } from '../../common/delivery-fee'
import { User } from '../auth/auth.entity'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { Checkout } from '../payments/entities/checkout.entity'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { CourierProfile } from './entities/courier-profile.entity'
import { DeliveryEvent, DeliveryEventType } from './entities/delivery-event.entity'
import { DeliveryOffer, DeliveryOfferResponse } from './entities/delivery-offer.entity'
import { DeliveryRun, DeliveryRunOutcome, DeliveryRunStatus } from './entities/delivery-run.entity'
import { Delivery, DeliveryStatus, DispatchPhase } from './entities/delivery.entity'

const TEN_MINUTES_MS = 10 * 60 * 1000
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000
/** Sans preneur passé ce délai, le back-office est alerté (FR-022). */
const ESCALATE_AFTER_MS = 15 * 60 * 1000
/** Sans preneur passé ce délai, la tournée se dégroupe (FR-022a). */
const UNGROUP_AFTER_MS = 30 * 60 * 1000
/** Après le dégroupage, délai avant de rendre la main à l'acheteur (FR-022c). */
const PROMPT_AFTER_UNGROUP_MS = 15 * 60 * 1000
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
  full_name: string
  distance_km: string | null
  active_deliveries: string
  rating_avg: number | null
  acceptance_rate: string | null
}

/** Ce que la diffusion propose : une course isolée, ou une tournée. */
export interface DispatchTarget {
  kind: 'DELIVERY' | 'RUN'
  id: string
  broadcastRadiusKm: number
}

export interface RankedCourier {
  id: string
  userId: string
  fullName: string
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
   * Ce qu'il faut savoir d'un objet à diffuser pour chercher un livreur : d'où
   * l'on part, et jusqu'où l'on cherche.
   *
   * Une course isolée et une tournée n'ont plus de chemin séparé ici. Dupliquer
   * cette recherche aurait créé deux systèmes de diffusion qui divergent au
   * premier correctif ; ce sont deux appelants d'une même fonction.
   */
  private async targetOrigin(target: DispatchTarget): Promise<{ latitude: number, longitude: number } | null> {
    const table = target.kind === 'RUN' ? 'delivery_runs' : 'deliveries'
    const rows = await this.em.getConnection().execute(
      `SELECT ST_Y(pickup_location::geometry) AS latitude,
              ST_X(pickup_location::geometry) AS longitude
       FROM "${table}" WHERE id = ? AND pickup_location IS NOT NULL`,
      [target.id],
    ) as Array<{ latitude: number | string, longitude: number | string }>
    if (rows.length === 0) {
      return null
    }
    return { latitude: Number(rows[0].latitude), longitude: Number(rows[0].longitude) }
  }

  /**
   * Validated + available couriers with a fresh (<12h) position inside the
   * target's current radius. A target without a pickup location falls back
   * to every available courier, distance-free.
   */
  async findEligibleFor(target: DispatchTarget): Promise<EligibleCourier[]> {
    const debt = await this.debtFilter()
    const origin = await this.targetOrigin(target)

    if (origin) {
      // Fresh live position first; declared zone circle as fallback so a
      // courier who has not opened the app today still gets nearby offers.
      return this.em.getConnection().execute(
        `SELECT cp.id, cp.user_id
         FROM courier_profiles cp,
              LATERAL (SELECT ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography AS pickup) p
         WHERE cp.validation_status = 'VALIDATED'
           AND cp.is_available = true${debt.sql}
           AND (
             (cp.last_known_location IS NOT NULL
               AND cp.last_location_at > NOW() - INTERVAL '12 hours'
               AND ST_DWithin(cp.last_known_location, p.pickup, ? * 1000))
             OR (
               (cp.last_known_location IS NULL OR cp.last_location_at <= NOW() - INTERVAL '12 hours')
               AND cp.zone_latitude IS NOT NULL
               AND ST_DWithin(
                 ST_SetSRID(ST_MakePoint(cp.zone_longitude, cp.zone_latitude), 4326)::geography,
                 p.pickup,
                 GREATEST(? * 1000, COALESCE(cp.zone_radius_km, 0) * 1000)
               )
             )
           )`,
        [origin.longitude, origin.latitude, ...debt.params, target.broadcastRadiusKm, target.broadcastRadiusKm],
      )
    }

    return this.em.getConnection().execute(
      `SELECT cp.id, cp.user_id
       FROM courier_profiles cp
       WHERE cp.validation_status = 'VALIDATED' AND cp.is_available = true${debt.sql}`,
      debt.params,
    )
  }

  /** Une course isolée, telle que la diffusion la voit. */
  private async deliveryTarget(deliveryId: string): Promise<DispatchTarget | null> {
    const rows = await this.em.getConnection().execute(
      `SELECT broadcast_radius_km FROM deliveries WHERE id = ?`,
      [deliveryId],
    ) as Array<{ broadcast_radius_km: number | string }>
    if (rows.length === 0) {
      return null
    }
    return { kind: 'DELIVERY', id: deliveryId, broadcastRadiusKm: Number(rows[0].broadcast_radius_km) }
  }

  /** Une tournée, telle que la diffusion la voit. */
  private async runTarget(runId: string): Promise<DispatchTarget | null> {
    const rows = await this.em.getConnection().execute(
      `SELECT broadcast_radius_km FROM delivery_runs WHERE id = ?`,
      [runId],
    ) as Array<{ broadcast_radius_km: number | string }>
    if (rows.length === 0) {
      return null
    }
    return { kind: 'RUN', id: runId, broadcastRadiusKm: Number(rows[0].broadcast_radius_km) }
  }

  async findEligibleCouriers(deliveryId: string): Promise<EligibleCourier[]> {
    const target = await this.deliveryTarget(deliveryId)
    return target ? this.findEligibleFor(target) : []
  }

  /**
   * Eligible couriers not yet asked for this target, ranked by scoreCandidate.
   * Acceptance rate = share of answered targeted offers accepted over 30 days,
   * courses isolées et tournées confondues : un refus est un refus.
   */
  async rankCandidatesFor(target: DispatchTarget): Promise<RankedCourier[]> {
    const eligible = await this.findEligibleFor(target)
    if (eligible.length === 0) {
      return []
    }
    const origin = await this.targetOrigin(target)
    const askedColumn = target.kind === 'RUN' ? 'delivery_run_id' : 'delivery_id'
    const rows = await this.em.getConnection().execute(
      `SELECT cp.id, cp.user_id, cp.full_name, cp.rating_avg,
              CASE WHEN p.pickup IS NOT NULL AND l.loc IS NOT NULL
                THEN ROUND((ST_Distance(l.loc, p.pickup) / 1000)::numeric, 2)
              END AS distance_km,
              (SELECT COUNT(*) FROM deliveries a
                WHERE a.courier_id = cp.id AND a.status IN ('ACCEPTED', 'PICKED_UP', 'IN_TRANSIT')) AS active_deliveries,
              (SELECT AVG(CASE WHEN o.response = 'ACCEPTED' THEN 1.0 ELSE 0.0 END)
                FROM delivery_offers o
                WHERE o.courier_id = cp.id AND o.responded_at IS NOT NULL
                  AND o.response IN ('ACCEPTED', 'DECLINED', 'EXPIRED')
                  AND o.offered_at > NOW() - INTERVAL '30 days') AS acceptance_rate
       FROM courier_profiles cp
       CROSS JOIN LATERAL (
         SELECT CASE WHEN ?::boolean
           THEN ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography
         END AS pickup
       ) p
       CROSS JOIN LATERAL (
         SELECT COALESCE(
           CASE WHEN cp.last_location_at > NOW() - INTERVAL '12 hours' THEN cp.last_known_location END,
           CASE WHEN cp.zone_latitude IS NOT NULL
             THEN ST_SetSRID(ST_MakePoint(cp.zone_longitude, cp.zone_latitude), 4326)::geography
           END
         ) AS loc
       ) l
       WHERE cp.id = ANY(?::uuid[])
         AND NOT EXISTS (SELECT 1 FROM delivery_offers o WHERE o.${askedColumn} = ? AND o.courier_id = cp.id)`,
      [
        origin !== null,
        origin?.longitude ?? 0,
        origin?.latitude ?? 0,
        // knex would expand a JS array into a comma list; Postgres wants the literal form.
        `{${eligible.map(c => c.id).join(',')}}`,
        target.id,
      ],
    ) as CandidateRow[]

    return rows
      .map(row => ({
        id: row.id,
        userId: row.user_id,
        fullName: row.full_name,
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

  async rankCandidates(deliveryId: string): Promise<RankedCourier[]> {
    const target = await this.deliveryTarget(deliveryId)
    return target ? this.rankCandidatesFor(target) : []
  }

  /**
   * Entry point for a new or re-opened delivery: targeted rounds first.
   *
   * Une livraison qui appartient à une tournée n'entre pas ici : c'est la
   * tournée qui est proposée, d'un bloc. La diffuser aussi séparément
   * permettrait à un livreur d'en prendre une moitié, et le frais unique
   * promis à l'acheteur ne couvrirait plus rien.
   */
  async startDispatch(deliveryId: string): Promise<void> {
    const delivery = await this.em.findOne(Delivery, { id: deliveryId })
    if (!delivery || delivery.status !== DeliveryStatus.AWAITING_COURIER) {
      return
    }
    if (delivery.deliveryRun) {
      await this.startRunDispatch(delivery.deliveryRun.id)
      return
    }
    delivery.dispatchPhase = DispatchPhase.TARGETED
    delivery.offerRound = 0
    delivery.offeredToCourier = null
    delivery.offerExpiresAt = null
    delivery.dispatchStartedAt = delivery.dispatchStartedAt ?? new Date()
    await this.em.flush()
    await this.offerNext(deliveryId)
  }

  /** Runs scheduled during preparation whose search time has come. */
  async startScheduled(): Promise<void> {
    const due = await this.em.find(Delivery, {
      status: DeliveryStatus.AWAITING_COURIER,
      dispatchPhase: DispatchPhase.SCHEDULED,
      dispatchAt: { $lte: new Date() },
    })
    // Une livraison de tournée passe par `startDispatch`, qui la renvoie vers
    // sa tournée : la sortir de l'attente ici suffit.
    for (const delivery of due) {
      await this.startDispatch(delivery.id)
    }
  }

  @Cron('*/30 * * * * *')
  @EnsureRequestContext()
  async startScheduledCron(): Promise<void> {
    await this.startScheduled()
    // Une tournée n'attend pas une heure mais la dernière de ses boutiques :
    // c'est ici qu'on regarde si elle est complète.
    await this.startReadyRuns()
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
      payload: { courierId: best.id, courierName: best.fullName, round, score: Math.round(best.score * 100) / 100, distanceKm: best.distanceKm },
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

  /**
   * Ouvre la recherche d'un livreur pour une tournée.
   *
   * Une tournée n'est diffusée que lorsque **toutes** ses boutiques ont
   * préparé. Partir avant, c'est envoyer le livreur attendre devant la seconde
   * — et c'est lui, pas la plateforme, qui paierait cette attente.
   */
  async startRunDispatch(runId: string): Promise<void> {
    const run = await this.em.findOne(DeliveryRun, { id: runId }, { populate: ['deliveries'] })
    if (!run || run.status !== DeliveryRunStatus.AWAITING_COURIER) {
      return
    }
    if (!this.isRunReady(run)) {
      return
    }
    // Ordre provisoire d'abord — sans lui, le premier point de collecte n'est
    // pas défini et la recherche partirait d'une boutique au hasard.
    await this.applyProvisionalPickupOrder(run)
    await this.refreshRunPickupPoint(run)
    run.dispatchPhase = DispatchPhase.TARGETED
    run.offerRound = 0
    run.offeredToCourier = null
    run.offerExpiresAt = null
    run.dispatchStartedAt = run.dispatchStartedAt ?? new Date()
    await this.em.flush()
    await this.offerNextRun(runId)
  }

  /**
   * Toutes les boutiques de la tournée ont-elles remis leur colis à la
   * recherche ? Une tournée dont une livraison manque encore — la commande
   * n'est pas prête — n'est pas diffusable.
   */
  private isRunReady(run: DeliveryRun): boolean {
    const deliveries = run.deliveries.getItems()
    if (deliveries.length === 0 || deliveries.length < run.shopCount) {
      return false
    }
    return deliveries.every(delivery => (
      delivery.status === DeliveryStatus.AWAITING_COURIER
      && delivery.dispatchPhase !== DispatchPhase.SCHEDULED
    ))
  }

  /**
   * Ordre de passage provisoire, tant qu'aucun livreur n'est connu : la
   * boutique la plus éloignée du point de chute en premier, pour que le
   * dernier tronçon soit le plus court. Il se recalcule à l'acceptation,
   * depuis la position réelle du livreur.
   */
  private async applyProvisionalPickupOrder(run: DeliveryRun): Promise<void> {
    const deliveries = run.deliveries.getItems()
    if (deliveries.length === 0) {
      return
    }
    const checkout = await this.em.findOne(Checkout, { id: run.checkout.id })
    run.pickupOrder = orderPickups(
      deliveries.map(delivery => ({
        id: delivery.id,
        latitude: delivery.pickupLatitude ?? null,
        longitude: delivery.pickupLongitude ?? null,
      })),
      null,
      { latitude: checkout?.deliveryLatitude ?? null, longitude: checkout?.deliveryLongitude ?? null },
    )
    await this.em.flush()
  }

  /**
   * Le point de départ de la tournée : la première collecte de l'ordre de
   * passage. Recopié sur la tournée pour que la recherche de livreurs parte du
   * même endroit que lui.
   */
  private async refreshRunPickupPoint(run: DeliveryRun): Promise<void> {
    const firstId = run.pickupOrder[0] ?? run.deliveries.getItems()[0]?.id
    if (!firstId) {
      return
    }
    await this.em.getConnection().execute(
      `UPDATE delivery_runs SET pickup_location = (SELECT pickup_location FROM deliveries WHERE id = ?)
       WHERE id = ?`,
      [firstId, run.id],
    )
  }

  /**
   * Propose la tournée au meilleur livreur restant, ou la passe en diffusion
   * large quand les tours sont épuisés ou qu'il n'y a plus personne à solliciter.
   */
  async offerNextRun(runId: string): Promise<void> {
    const run = await this.em.findOne(DeliveryRun, { id: runId })
    if (!run || run.status !== DeliveryRunStatus.AWAITING_COURIER) {
      return
    }
    const target = await this.runTarget(runId)
    if (!target) {
      return
    }
    if (run.offerRound >= TARGETED_ROUNDS) {
      await this.switchRunToBroadcast(run)
      return
    }
    const [best] = await this.rankCandidatesFor(target)
    if (!best) {
      await this.switchRunToBroadcast(run)
      return
    }

    const round = run.offerRound + 1
    const expiresAt = new Date(Date.now() + OFFER_TIMEOUT_S * 1000)
    const courier = this.em.getReference(CourierProfile, best.id)
    this.em.create(DeliveryOffer, { deliveryRun: run, courier, round, score: best.score, expiresAt })
    run.dispatchPhase = DispatchPhase.TARGETED
    run.offerRound = round
    run.offeredToCourier = courier
    run.offerExpiresAt = expiresAt
    run.offersSent += 1
    await this.em.flush()

    const user = await this.em.findOne(User, { id: best.userId })
    if (user) {
      await this.notificationsService.send({
        user,
        type: NotificationType.DELIVERY_OFFER,
        title: 'Tournée proposée en priorité',
        body: `${this.runLabel(run)} — répondez dans les ${OFFER_TIMEOUT_S} s`,
        data: { deliveryRunId: run.id, expiresAt: expiresAt.toISOString(), targeted: true },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      })
    }
    this.logger.log(`Offered run ${run.id} to courier ${best.id} (round ${round}, score ${best.score.toFixed(2)})`)
  }

  /** Comment une tournée se présente à un livreur, en une ligne. */
  private runLabel(run: DeliveryRun): string {
    return run.shopCount > 1
      ? `Tournée de ${run.shopCount} boutiques`
      : 'Course à retirer'
  }

  /** Le livreur sollicité a répondu, ou le délai a expiré. */
  async respondToRunOffer(runId: string, courierId: string, response: DeliveryOfferResponse): Promise<void> {
    const offer = await this.em.findOne(DeliveryOffer, {
      deliveryRun: { id: runId },
      courier: { id: courierId },
      respondedAt: null,
    }, { orderBy: { offeredAt: 'DESC' } })
    if (!offer) {
      return
    }
    offer.respondedAt = new Date()
    offer.response = response
    const run = await this.em.findOne(DeliveryRun, { id: runId })
    if (run && run.offeredToCourier?.id === courierId && response !== DeliveryOfferResponse.ACCEPTED) {
      run.offeredToCourier = null
      run.offerExpiresAt = null
    }
    await this.em.flush()
    if (response === DeliveryOfferResponse.DECLINED || response === DeliveryOfferResponse.EXPIRED) {
      await this.offerNextRun(runId)
    }
  }

  /** Ferme l'offre en cours quand la tournée sort de la boucle autrement. */
  async cancelPendingRunOffer(runId: string): Promise<void> {
    const pending = await this.em.find(DeliveryOffer, { deliveryRun: { id: runId }, respondedAt: null })
    for (const offer of pending) {
      offer.respondedAt = new Date()
      offer.response = DeliveryOfferResponse.SUPERSEDED
    }
    const run = await this.em.findOne(DeliveryRun, { id: runId })
    if (run) {
      run.offeredToCourier = null
      run.offerExpiresAt = null
    }
    await this.em.flush()
  }

  private async switchRunToBroadcast(run: DeliveryRun): Promise<void> {
    run.dispatchPhase = DispatchPhase.BROADCAST
    run.offeredToCourier = null
    run.offerExpiresAt = null
    run.offeredAt = new Date()
    await this.em.flush()
    await this.broadcastRun(run.id)
  }

  /** Pousse la tournée à tous les livreurs éligibles. */
  async broadcastRun(runId: string): Promise<number> {
    const run = await this.em.findOne(DeliveryRun, { id: runId })
    if (!run || run.status !== DeliveryRunStatus.AWAITING_COURIER) {
      return 0
    }
    const target = await this.runTarget(runId)
    if (!target) {
      return 0
    }

    const couriers = await this.findEligibleFor(target)
    const users = couriers.length > 0
      ? await this.em.find(User, { id: { $in: couriers.map(c => c.user_id) } })
      : []

    await Promise.all(users.map(user => this.notificationsService.send({
      user,
      type: NotificationType.DELIVERY_OFFER,
      title: 'Nouvelle tournée disponible',
      body: `${this.runLabel(run)} — ${run.courierEarning.toLocaleString('fr-FR')} FCFA`,
      data: { deliveryRunId: run.id },
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    })))
    await this.em.flush()

    this.logger.log(`Broadcast run ${run.id} to ${users.length} courier(s) (radius ${run.broadcastRadiusKm} km)`)
    return users.length
  }

  /** Offres de tournée hors délai : journaliser et solliciter le suivant. */
  async expireRunOffers(): Promise<void> {
    const expired = await this.em.find(DeliveryRun, {
      status: DeliveryRunStatus.AWAITING_COURIER,
      dispatchPhase: DispatchPhase.TARGETED,
      $or: [{ offerExpiresAt: { $lt: new Date() } }, { offerExpiresAt: null }],
    }, { populate: ['offeredToCourier'] })
    for (const run of expired) {
      const courierId = run.offeredToCourier?.id
      if (courierId) {
        await this.respondToRunOffer(run.id, courierId, DeliveryOfferResponse.EXPIRED)
      }
      else {
        await this.offerNextRun(run.id)
      }
    }
  }

  /** Tournée sans preneur depuis 10 min : élargir le rayon et repousser. */
  async rebroadcastStaleRuns(): Promise<void> {
    const cutoff = new Date(Date.now() - TEN_MINUTES_MS)
    const stale = await this.em.find(DeliveryRun, {
      status: DeliveryRunStatus.AWAITING_COURIER,
      dispatchPhase: DispatchPhase.BROADCAST,
      offeredAt: { $lt: cutoff },
    })
    for (const run of stale) {
      run.broadcastRadiusKm = Math.min(run.broadcastRadiusKm + RADIUS_STEP_KM, RADIUS_CAP_KM)
      run.offeredAt = new Date()
      await this.em.flush()
      await this.broadcastRun(run.id)
    }
  }

  /**
   * Tournées dont la dernière boutique vient de préparer. Le déclencheur ne
   * peut pas vivre au moment où une livraison naît : c'est la *dernière* qui
   * ouvre la diffusion, et aucune d'elles ne sait qu'elle est la dernière.
   */
  async startReadyRuns(): Promise<void> {
    const waiting = await this.em.find(DeliveryRun, {
      status: DeliveryRunStatus.AWAITING_COURIER,
      dispatchStartedAt: null,
    }, { populate: ['deliveries'] })
    for (const run of waiting) {
      if (this.isRunReady(run)) {
        await this.startRunDispatch(run.id)
      }
    }
  }

  /**
   * Le sort d'une tournée que personne ne prend, en trois temps.
   *
   * 15 minutes : le back-office est alerté et peut attribuer un livreur à la
   * main. La diffusion continue pendant ce temps — l'alerte n'interrompt rien.
   *
   * 30 minutes : la tournée se **dégroupe**. Ses livraisons repartent une par
   * une, parce que faire attendre l'acheteur pendant que la marchandise est
   * prête chez des boutiques qui ont préparé est le pire des dénouements. Les
   * plateformes comparables font de même : quand le lot n'a pas de sens, elles
   * basculent sur deux livreurs plutôt que sur aucun.
   *
   * La main n'est rendue à l'acheteur que si les courses séparées ne trouvent
   * personne non plus — c'est FR-022c, et c'est le dernier recours.
   */
  async escalateStaleRuns(): Promise<void> {
    const now = Date.now()
    const waiting = await this.em.find(DeliveryRun, {
      status: { $in: [DeliveryRunStatus.AWAITING_COURIER, DeliveryRunStatus.ESCALATED] },
      dispatchStartedAt: { $ne: null },
    }, { populate: ['deliveries', 'checkout'] })

    for (const run of waiting) {
      const since = run.dispatchStartedAt ? now - run.dispatchStartedAt.getTime() : 0
      if (since >= UNGROUP_AFTER_MS) {
        await this.ungroupRun(run)
      }
      else if (since >= ESCALATE_AFTER_MS && run.escalatedAt == null) {
        run.escalatedAt = new Date()
        run.status = DeliveryRunStatus.ESCALATED
        await this.em.flush()
        this.logger.warn(`Run ${run.id} unserved after 15 min — escalated to the back-office`)
      }
    }
  }

  @Cron('*/60 * * * * *')
  @EnsureRequestContext()
  async escalateStaleRunsCron(): Promise<void> {
    await this.escalateStaleRuns()
  }

  /**
   * Dégroupe une tournée : ses livraisons redeviennent des courses isolées et
   * repartent chacune de son côté.
   *
   * La tournée n'est pas supprimée mais close en `UNSERVED` : son échec est
   * une donnée, c'est elle qui dira plus tard si les seuils de regroupement
   * sont bien placés.
   */
  async ungroupRun(run: DeliveryRun): Promise<void> {
    const deliveries = run.deliveries.getItems()
    await this.cancelPendingRunOffer(run.id)

    run.status = DeliveryRunStatus.CANCELLED
    run.outcome = DeliveryRunOutcome.UNSERVED
    run.offeredToCourier = null
    run.offerExpiresAt = null
    await this.em.flush()

    // Chaque course reprend son propre frais, part de la tournée : c'est ce
    // qui la rend diffusable seule, et payable seule au livreur.
    const rate = await this.platformSettings.getDeliveryCommissionRate()
    const share = deliveries.length > 0 ? Math.round(run.deliveryFee / deliveries.length) : 0
    for (const delivery of deliveries) {
      delivery.deliveryRun = undefined
      delivery.deliveryFee = share
      delivery.courierFee = computeCourierFee(share, rate)
      delivery.dispatchPhase = DispatchPhase.TARGETED
      delivery.offerRound = 0
      delivery.offeredToCourier = null
      delivery.offerExpiresAt = null
      delivery.dispatchStartedAt = new Date()
      this.em.create(DeliveryEvent, {
        delivery,
        type: DeliveryEventType.REASSIGNED,
        payload: { deliveryRunId: run.id, reason: 'RUN_UNSERVED' },
      })
    }
    await this.em.flush()

    for (const delivery of deliveries) {
      await this.startDispatch(delivery.id)
    }

    const buyer = await this.em.findOne(User, { id: run.checkout.buyer.id })
    if (buyer) {
      await this.notificationsService.send({
        user: buyer,
        type: NotificationType.DELIVERY_REASSIGNED,
        title: 'Livraison en plusieurs fois',
        body: `Aucun livreur n'a pu prendre vos ${run.shopCount} boutiques ensemble. Chaque commande part séparément — vous serez livré en plusieurs fois.`,
        data: { deliveryRunId: run.id },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      })
    }
    this.logger.warn(`Run ${run.id} ungrouped after 30 min into ${deliveries.length} separate deliveries`)
  }

  /**
   * Rendre la main à l'acheteur, mais seulement en dernier recours.
   *
   * Une tournée dégroupée dont les courses ne trouvent toujours personne a
   * épuisé ce que la plateforme sait faire. À ce stade, continuer d'attendre
   * en silence serait pire que de poser la question : l'acheteur décide
   * d'attendre encore ou d'annuler et d'être crédité.
   */
  async promptBuyersForUnservedRuns(): Promise<void> {
    const cutoff = new Date(Date.now() - PROMPT_AFTER_UNGROUP_MS)
    const ungrouped = await this.em.find(DeliveryRun, {
      status: DeliveryRunStatus.CANCELLED,
      outcome: DeliveryRunOutcome.UNSERVED,
      buyerPromptedAt: null,
      updatedAt: { $lt: cutoff },
    }, { populate: ['checkout'] })

    for (const run of ungrouped) {
      // Les courses libérées ont-elles trouvé preneur ? Une seule acceptée
      // suffit à ne pas déranger l'acheteur : il sera livré.
      const stillWaiting = await this.em.count(Delivery, {
        order: { checkout: { id: run.checkout.id } },
        status: DeliveryStatus.AWAITING_COURIER,
      })
      if (stillWaiting === 0) {
        run.buyerPromptedAt = new Date()
        await this.em.flush()
        continue
      }

      run.buyerPromptedAt = new Date()
      run.status = DeliveryRunStatus.BUYER_DECISION
      await this.em.flush()

      const buyer = await this.em.findOne(User, { id: run.checkout.buyer.id })
      if (buyer) {
        await this.notificationsService.send({
          user: buyer,
          type: NotificationType.DELIVERY_REASSIGNED,
          title: 'Aucun livreur disponible',
          body: 'Nous ne trouvons pas de livreur pour votre commande. Vous pouvez attendre encore, ou annuler et être recrédité intégralement.',
          data: { deliveryRunId: run.id, buyerDecision: true },
          channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
        })
      }
      this.logger.warn(`Run ${run.id} still unserved after ungrouping — buyer asked to decide`)
    }
  }

  @Cron('*/60 * * * * *')
  @EnsureRequestContext()
  async promptBuyersCron(): Promise<void> {
    await this.promptBuyersForUnservedRuns()
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
      deliveryRun: null,
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
    await this.expireRunOffers()
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
    await this.rebroadcastStaleRuns()
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
      deliveryRun: null,
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
