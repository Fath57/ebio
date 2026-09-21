import type {
  CompleteDelivery,
  FailDelivery,
  RegisterCourier,
  UpdateCourier,
} from './contracts/delivery.contract'
import type { ActiveRunRow, DeliveryAudience, OfferRow, RunOfferRow } from './deliveries.mapper'
import { randomInt } from 'node:crypto'
import { EntityManager } from '@mikro-orm/postgresql'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { computeCourierFee, orderPickups } from '../../common/delivery-fee'
import { User, UserRole } from '../auth/auth.entity'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { Order, OrderStatus, PaymentMethod } from '../orders/entities/order.entity'
import { OrdersService } from '../orders/orders.service'
import { Checkout } from '../payments/entities/checkout.entity'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { ValidationStatus } from '../suppliers/supplier.entity'
import { WalletTransactionType } from '../wallet/entities/wallet-transaction.entity'
import { PlatformAccount } from '../wallet/entities/wallet.entity'
import { WalletService } from '../wallet/wallet.service'
import { DispatchService } from './dispatch.service'
import { CourierProfile, VehicleType } from './entities/courier-profile.entity'
import { DeliveryEvent, DeliveryEventType } from './entities/delivery-event.entity'
import { DeliveryOfferResponse } from './entities/delivery-offer.entity'
import { DeliveryRun, DeliveryRunStatus } from './entities/delivery-run.entity'
import { Delivery, DeliveryFailReason, DeliveryProofType, DeliveryStatus, DispatchPhase } from './entities/delivery.entity'

const ACTIVE_STATUSES = [DeliveryStatus.ACCEPTED, DeliveryStatus.PICKED_UP, DeliveryStatus.IN_TRANSIT]
/** The courier search starts this long before the shop's readiness estimate. */
export const DISPATCH_LEAD_MINUTES = 10

/** Why a validated, available courier still gets no runs. */
export interface DispatchBlock {
  reason: 'DEBT'
  /** Current wallet balance (negative). */
  balance: number
  /** Platform debt limit the balance went past. */
  limit: number
}

@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger(DeliveriesService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly notificationsService: NotificationsService,
    private readonly dispatchService: DispatchService,
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
    private readonly walletService: WalletService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  // ===== Courier profile =====

  async registerCourier(userId: string, data: RegisterCourier): Promise<CourierProfile> {
    const existing = await this.em.findOne(CourierProfile, { user: { id: userId } })
    if (existing) {
      throw new ConflictException('A courier application already exists for this account')
    }

    const user = await this.em.findOneOrFail(User, { id: userId })
    const profile = this.em.create(CourierProfile, {
      user,
      fullName: data.fullName,
      phone: data.phone,
      vehicleType: data.vehicleType as VehicleType,
      zone: data.zone,
      zoneLatitude: data.zoneLatitude,
      zoneLongitude: data.zoneLongitude,
      zoneRadiusKm: data.zoneRadiusKm,
      identityDocument: data.identityDocument,
    })
    await this.em.flush()
    return profile
  }

  async getMyProfile(userId: string): Promise<CourierProfile> {
    const profile = await this.em.findOne(CourierProfile, { user: { id: userId } }, { populate: ['user'] })
    if (!profile) {
      throw new NotFoundException('No courier profile for this account')
    }
    return profile
  }

  async updateMyProfile(userId: string, data: UpdateCourier): Promise<CourierProfile> {
    const profile = await this.getMyProfile(userId)
    if (data.fullName !== undefined) {
      profile.fullName = data.fullName
    }
    if (data.phone !== undefined) {
      profile.phone = data.phone
    }
    if (data.vehicleType !== undefined) {
      profile.vehicleType = data.vehicleType as VehicleType
    }
    if (data.zone !== undefined) {
      profile.zone = data.zone
    }
    if (data.zoneLatitude !== undefined) {
      profile.zoneLatitude = data.zoneLatitude
    }
    if (data.zoneLongitude !== undefined) {
      profile.zoneLongitude = data.zoneLongitude
    }
    if (data.zoneRadiusKm !== undefined) {
      profile.zoneRadiusKm = data.zoneRadiusKm
    }
    if (data.identityDocument !== undefined) {
      profile.identityDocument = data.identityDocument
    }
    await this.em.flush()
    return profile
  }

  async setAvailability(userId: string, isAvailable: boolean): Promise<CourierProfile> {
    const profile = await this.getMyProfile(userId)
    if (profile.validationStatus !== ValidationStatus.VALIDATED) {
      throw new ForbiddenException('Only validated couriers can go online')
    }
    profile.isAvailable = isAvailable
    await this.em.flush()
    return profile
  }

  async updateLocation(userId: string, latitude: number, longitude: number): Promise<void> {
    const profile = await this.getMyProfile(userId)
    if (profile.validationStatus !== ValidationStatus.VALIDATED) {
      throw new ForbiddenException('Only validated couriers can report a position')
    }
    await this.em.getConnection().execute(
      `UPDATE courier_profiles
       SET last_known_location = ST_MakePoint(?, ?)::geography,
           last_latitude = ?, last_longitude = ?,
           last_location_at = NOW(), "updatedAt" = NOW()
       WHERE id = ?`,
      [longitude, latitude, latitude, longitude, profile.id],
    )
  }

  // ===== Delivery lifecycle =====

  /**
   * Called by OrdersService when a DELIVERY order turns READY. Snapshots both
   * addresses, the fee split (the platform rate may change later — the run
   * is paid at the rate in force when it was offered), and copies the
   * supplier position (may be null — the broadcast then targets everyone and
   * the supplier is nudged to set a location).
   */
  /**
   * Ouvre la tournée d'un passage en caisse livré.
   *
   * Elle naît vide : les livraisons s'y rattachent au fur et à mesure qu'elles
   * sont créées, commande par commande, quand chaque boutique accepte. La
   * diffusion n'a lieu qu'une fois toutes les collectes connues.
   *
   * La rémunération suit la règle existante — `computeCourierFee` sur les
   * frais — appliquée au frais unique de la tournée. Le livreur touche sa part
   * du trajet qu'il parcourt réellement, et non une part par commande
   * transportée, ce qui le paierait trois fois pour un seul déplacement.
   */
  /**
   * Un panier ouvre autant de tournées que son découpage en compte. L'unicité
   * n'est donc plus celle du panier mais celle du lot de boutiques : rejouer
   * la création ne doit pas ouvrir deux fois la même tournée.
   */
  async createRunForCheckout(input: {
    checkoutId: string
    supplierIds: string[]
    deliveryFee: number
    distanceKm: number | null
    pickupSpreadKm: number | null
  }): Promise<DeliveryRun | null> {
    const siblings = await this.em.find(DeliveryRun, { checkout: { id: input.checkoutId } })
    const existing = siblings.find(run => input.supplierIds.some(id => run.supplierIds.includes(id)))
    if (existing) {
      return existing
    }
    const rate = await this.platformSettings.getDeliveryCommissionRate()
    const run = this.em.create(DeliveryRun, {
      checkout: this.em.getReference(Checkout, input.checkoutId),
      supplierIds: input.supplierIds,
      deliveryFee: input.deliveryFee,
      courierEarning: computeCourierFee(input.deliveryFee, rate),
      totalDistanceKm: input.distanceKm ?? undefined,
      pickupSpreadKm: input.pickupSpreadKm ?? undefined,
      shopCount: input.supplierIds.length,
    })
    await this.em.flush()
    return run
  }

  async createForOrder(order: Order): Promise<Delivery | null> {
    const existing = await this.em.findOne(Delivery, { order: { id: order.id } })
    if (existing) {
      // Scheduled during preparation and the parcel is ready early: search now.
      if (existing.status === DeliveryStatus.AWAITING_COURIER && existing.dispatchPhase === DispatchPhase.SCHEDULED) {
        existing.pickupReadyAt = new Date()
        await this.em.flush()
        await this.dispatchService.startDispatch(existing.id)
      }
      return existing
    }
    return this.createDelivery(order, null)
  }

  /**
   * PREPARING with a readiness estimate: the run exists at once (visible to
   * the back-office, assignable by hand) but stays SCHEDULED until
   * DISPATCH_LEAD_MINUTES before the estimate, when the search starts.
   */
  async scheduleForOrder(order: Order): Promise<Delivery | null> {
    const existing = await this.em.findOne(Delivery, { order: { id: order.id } })
    if (existing) {
      return existing
    }
    const readyAt = order.estimatedReadyAt ?? new Date()
    const dispatchAt = new Date(Math.max(Date.now(), readyAt.getTime() - DISPATCH_LEAD_MINUTES * 60_000))
    return this.createDelivery(order, { readyAt, dispatchAt })
  }

  private async createDelivery(order: Order, schedule: { readyAt: Date, dispatchAt: Date } | null): Promise<Delivery | null> {
    const supplier = order.supplier
    // A sponsored (free-delivery promotion) run is still paid to the courier
    // in full: the snapshot is the real fee, whoever covers it.
    const deliveryFee = (order.deliveryFee || order.sponsoredDeliveryFee) ?? 0
    const rate = await this.platformSettings.getDeliveryCommissionRate()
    // La livraison rejoint la tournée qui collecte chez sa boutique — un panier
    // peut en compter plusieurs, et se tromper de tournée enverrait le livreur
    // à la mauvaise adresse.
    const run = order.checkout
      ? (await this.em.find(DeliveryRun, { checkout: { id: order.checkout.id } }))
          .find(candidate => candidate.supplierIds.includes(supplier.id)) ?? null
      : null
    const delivery = this.em.create(Delivery, {
      order,
      deliveryRun: run ?? undefined,
      pickupAddress: supplier.address ?? supplier.shopName,
      dropoffAddress: order.deliveryAddress ?? '',
      offeredAt: new Date(),
      deliveryFee,
      courierFee: computeCourierFee(deliveryFee, rate),
      dispatchPhase: schedule ? DispatchPhase.SCHEDULED : DispatchPhase.BROADCAST,
      pickupReadyAt: schedule?.readyAt ?? null,
      dispatchAt: schedule?.dispatchAt ?? null,
    })
    this.em.create(DeliveryEvent, {
      delivery,
      type: DeliveryEventType.CREATED,
      payload: schedule
        ? { orderNumber: order.orderNumber, readyAt: schedule.readyAt.toISOString(), dispatchAt: schedule.dispatchAt.toISOString() }
        : { orderNumber: order.orderNumber },
    })
    await this.em.flush()

    // Copy the supplier's PostGIS point, raw SQL like every geo access. The
    // plain lat/lng snapshot feeds the buyer tracking map without PostGIS.
    await this.em.getConnection().execute(
      `UPDATE deliveries SET
         pickup_location = (SELECT location FROM suppliers WHERE id = ?),
         pickup_latitude = (SELECT ST_Y(location::geometry) FROM suppliers WHERE id = ?),
         pickup_longitude = (SELECT ST_X(location::geometry) FROM suppliers WHERE id = ?)
       WHERE id = ?`,
      [supplier.id, supplier.id, supplier.id, delivery.id],
    )

    const hasLocation = await this.em.getConnection().execute(
      `SELECT pickup_location IS NOT NULL AS has_location FROM deliveries WHERE id = ?`,
      [delivery.id],
    )
    if (!hasLocation[0]?.has_location) {
      const supplierUser = await this.resolveSupplierUser(order)
      if (supplierUser) {
        await this.notificationsService.send({
          user: supplierUser,
          type: NotificationType.SYSTEM,
          title: 'Position de la boutique manquante',
          body: 'Renseignez la position de votre boutique pour que les livreurs proches reçoivent vos courses en priorité.',
          data: { deliveryId: delivery.id },
          channels: [NotificationChannel.IN_APP],
        })
      }
    }

    if (schedule && schedule.dispatchAt.getTime() > Date.now()) {
      // The scheduled-dispatch cron takes over at dispatchAt.
      return delivery
    }
    try {
      await this.dispatchService.startDispatch(delivery.id)
    }
    catch (error) {
      // A failed push must not block the READY transition; the cron rebroadcasts.
      this.logger.error(`Initial broadcast failed for delivery ${delivery.id}`, error instanceof Error ? error.stack : String(error))
    }

    return delivery
  }

  /**
   * Cash commissions can drive a courier balance negative; past the platform
   * limit the courier is kept out of dispatch until they top up. Null when
   * nothing blocks them.
   */
  async getDispatchBlock(courierId: string): Promise<DispatchBlock | null> {
    const limit = await this.platformSettings.getCourierMaxDebt()
    if (limit <= 0) {
      return null
    }
    const wallet = await this.walletService.getOrCreate({ courierId })
    const balance = Number(wallet.balance)
    return balance < -limit ? { reason: 'DEBT', balance, limit } : null
  }

  private async assertNotBlocked(courierId: string): Promise<void> {
    const block = await this.getDispatchBlock(courierId)
    if (block) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'COURIER_DEBT',
        message: `Votre portefeuille est à ${block.balance.toLocaleString('fr-FR')} FCFA, au-delà de la dette autorisée (${block.limit.toLocaleString('fr-FR')} FCFA). Rechargez-le pour reprendre les courses.`,
        balance: block.balance,
        limit: block.limit,
      })
    }
  }

  async getOffers(userId: string): Promise<OfferRow[]> {
    const profile = await this.getMyProfile(userId)
    if (profile.validationStatus !== ValidationStatus.VALIDATED || !profile.isAvailable) {
      throw new ForbiddenException('Passez disponible pour voir les courses proposées')
    }
    await this.assertNotBlocked(profile.id)

    // Reference point: fresh (<12h) live position first, declared zone circle
    // as fallback. A courier with neither only sees location-less deliveries.
    return this.em.getConnection().execute(
      `WITH me AS (
         SELECT
           COALESCE(
             CASE WHEN last_location_at > NOW() - INTERVAL '12 hours' THEN last_known_location END,
             CASE WHEN zone_latitude IS NOT NULL
               THEN ST_SetSRID(ST_MakePoint(zone_longitude, zone_latitude), 4326)::geography
             END
           ) AS loc,
           GREATEST(COALESCE(zone_radius_km, 0) * 1000, 0) AS zone_radius_m
         FROM courier_profiles WHERE id = ?
       )
       SELECT d.id, o.order_number, d.pickup_address, d.dropoff_address, d.offered_at,
              s.shop_name, o.total_amount, o.payment_method, d.delivery_fee, d.courier_fee,
              o.delivery_fee AS buyer_delivery_fee,
              (d.offered_to_courier_id = ?) AS is_targeted,
              CASE WHEN d.offered_to_courier_id = ? THEN d.offer_expires_at END AS offer_expires_at,
              o.delivery_latitude AS dropoff_latitude, o.delivery_longitude AS dropoff_longitude,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS items_count,
              CASE WHEN d.pickup_location IS NOT NULL AND me.loc IS NOT NULL
                THEN ROUND((ST_Distance(d.pickup_location, me.loc) / 1000)::numeric, 2)
              END AS distance_km,
              CASE WHEN d.pickup_location IS NOT NULL AND o.delivery_latitude IS NOT NULL
                THEN ROUND((ST_Distance(d.pickup_location,
                  ST_SetSRID(ST_MakePoint(o.delivery_longitude, o.delivery_latitude), 4326)::geography) / 1000)::numeric, 2)
              END AS route_km
       FROM deliveries d
       JOIN orders o ON o.id = d.order_id
       JOIN suppliers s ON s.id = o.supplier_id
       CROSS JOIN me
       WHERE d.status = 'AWAITING_COURIER'
         -- Une livraison de tournée ne se propose pas seule : sa tournée est
         -- proposée d'un bloc, sans quoi un livreur en prendrait la moitié.
         AND d.delivery_run_id IS NULL
         AND (
           -- Exclusive offer still open for me: shown whatever the radius.
           (d.offered_to_courier_id = ? AND d.offer_expires_at > NOW())
           OR (
             d.dispatch_phase = 'BROADCAST'
             AND (
               d.pickup_location IS NULL
               OR (me.loc IS NOT NULL AND ST_DWithin(d.pickup_location, me.loc, GREATEST(d.broadcast_radius_km * 1000, me.zone_radius_m)))
             )
           )
         )
       ORDER BY is_targeted DESC, distance_km ASC NULLS LAST, d.offered_at ASC`,
      [profile.id, profile.id, profile.id, profile.id],
    )
  }

  /** First-write-wins claim: the WHERE courier_id IS NULL guard is the lock. */
  async accept(deliveryId: string, userId: string): Promise<Delivery> {
    const profile = await this.getMyProfile(userId)
    if (profile.validationStatus !== ValidationStatus.VALIDATED || !profile.isAvailable) {
      throw new ForbiddenException('Passez disponible pour accepter une course')
    }
    await this.assertNotBlocked(profile.id)

    const attached = await this.em.findOne(Delivery, { id: deliveryId }, { populate: ['deliveryRun'] })
    if (attached?.deliveryRun) {
      throw new ConflictException('Cette course fait partie d\'une tournée : acceptez la tournée entière')
    }

    // Targeted phase: only the courier holding the open offer may claim.
    const claimed = await this.em.getConnection().execute(
      `UPDATE deliveries
       SET courier_id = ?, status = 'ACCEPTED', accepted_at = NOW(),
           offered_to_courier_id = NULL, offer_expires_at = NULL, "updatedAt" = NOW()
       WHERE id = ? AND courier_id IS NULL AND status = 'AWAITING_COURIER'
         AND (dispatch_phase = 'BROADCAST' OR (offered_to_courier_id = ? AND offer_expires_at > NOW()))
       RETURNING id`,
      [profile.id, deliveryId, profile.id],
    )

    if (claimed.length === 0) {
      const delivery = await this.em.findOne(Delivery, { id: deliveryId })
      if (!delivery) {
        throw new NotFoundException('Delivery not found')
      }
      if (delivery.status === DeliveryStatus.CANCELLED) {
        throw new GoneException('Cette commande a été annulée')
      }
      if (delivery.status === DeliveryStatus.AWAITING_COURIER) {
        throw new ConflictException('Cette course est proposée à un autre livreur pour le moment')
      }
      throw new ConflictException('Cette course a déjà été prise par un autre livreur')
    }

    await this.dispatchService.respondToOffer(deliveryId, profile.id, DeliveryOfferResponse.ACCEPTED)
    const delivery = await this.loadDelivery(deliveryId)
    this.em.create(DeliveryEvent, {
      delivery,
      type: DeliveryEventType.ACCEPTED,
      actorUserId: userId,
      payload: { courierId: profile.id },
    })
    await this.em.flush()

    const supplierUser = await this.resolveSupplierUser(delivery.order)
    await Promise.all([
      supplierUser
        ? this.notificationsService.send({
            user: supplierUser,
            type: NotificationType.DELIVERY_ASSIGNED,
            title: 'Livreur trouvé',
            body: `${profile.fullName} prend en charge la commande ${delivery.order.orderNumber}`,
            data: { deliveryId: delivery.id, orderId: delivery.order.id },
            channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
          })
        : Promise.resolve(),
      this.notificationsService.send({
        user: delivery.order.buyer,
        type: NotificationType.DELIVERY_ASSIGNED,
        title: 'Livreur en route',
        body: `${profile.fullName} livrera votre commande ${delivery.order.orderNumber}`,
        data: { deliveryId: delivery.id, orderId: delivery.order.id },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      }),
    ])

    return delivery
  }

  /**
   * Les tournées proposées à ce livreur : celles qu'il tient en exclusivité, et
   * celles que la diffusion large a poussées dans son rayon.
   *
   * Même point de référence que pour les courses isolées — position réelle de
   * moins de 12 h, à défaut la zone déclarée — et mêmes règles de visibilité.
   */
  async getRunOffers(userId: string): Promise<RunOfferRow[]> {
    const profile = await this.getMyProfile(userId)
    if (profile.validationStatus !== ValidationStatus.VALIDATED || !profile.isAvailable) {
      throw new ForbiddenException('Passez disponible pour voir les tournées proposées')
    }
    await this.assertNotBlocked(profile.id)

    return this.em.getConnection().execute(
      `WITH me AS (
         SELECT
           COALESCE(
             CASE WHEN last_location_at > NOW() - INTERVAL '12 hours' THEN last_known_location END,
             CASE WHEN zone_latitude IS NOT NULL
               THEN ST_SetSRID(ST_MakePoint(zone_longitude, zone_latitude), 4326)::geography
             END
           ) AS loc,
           GREATEST(COALESCE(zone_radius_km, 0) * 1000, 0) AS zone_radius_m
         FROM courier_profiles WHERE id = ?
       )
       SELECT r.id, r.shop_count, r.courier_earning, r.delivery_fee, r.total_distance_km,
              r.pickup_order, r.offered_at,
              c.delivery_address AS dropoff_address,
              c.delivery_latitude AS dropoff_latitude, c.delivery_longitude AS dropoff_longitude,
              c.payment_method, c.total_amount,
              (r.offered_to_courier_id = ?) AS is_targeted,
              CASE WHEN r.offered_to_courier_id = ? THEN r.offer_expires_at END AS offer_expires_at,
              CASE WHEN r.pickup_location IS NOT NULL AND me.loc IS NOT NULL
                THEN ROUND((ST_Distance(r.pickup_location, me.loc) / 1000)::numeric, 2)
              END AS distance_km,
              (SELECT jsonb_agg(jsonb_build_object(
                 'deliveryId', d.id,
                 'shopName', s.shop_name,
                 'pickupAddress', d.pickup_address,
                 'orderNumber', o.order_number
               ) ORDER BY array_position(
                 ARRAY(SELECT jsonb_array_elements_text(r.pickup_order))::uuid[], d.id
               ))
               FROM deliveries d
               JOIN orders o ON o.id = d.order_id
               JOIN suppliers s ON s.id = o.supplier_id
               WHERE d.delivery_run_id = r.id) AS stops
       FROM delivery_runs r
       JOIN checkouts c ON c.id = r.checkout_id
       CROSS JOIN me
       WHERE r.status = 'AWAITING_COURIER'
         AND (
           (r.offered_to_courier_id = ? AND r.offer_expires_at > NOW())
           OR (
             r.dispatch_phase = 'BROADCAST'
             AND (
               r.pickup_location IS NULL
               OR (me.loc IS NOT NULL AND ST_DWithin(r.pickup_location, me.loc, GREATEST(r.broadcast_radius_km * 1000, me.zone_radius_m)))
             )
           )
         )
       ORDER BY is_targeted DESC, distance_km ASC NULLS LAST, r.offered_at ASC`,
      [profile.id, profile.id, profile.id, profile.id],
    )
  }

  /**
   * Ordonne les collectes d'une tournée depuis un point de départ.
   *
   * Appelé deux fois : à l'ouverture, sans livreur connu, pour que l'offre
   * montre un ordre plausible ; puis à l'acceptation, depuis la position réelle
   * du livreur — c'est celui-là qui fait foi, et c'est lui que le livreur suit.
   */
  private async applyPickupOrder(run: DeliveryRun, origin: { latitude: number, longitude: number } | null): Promise<void> {
    const deliveries = run.deliveries.isInitialized()
      ? run.deliveries.getItems()
      : await this.em.find(Delivery, { deliveryRun: { id: run.id } })
    if (deliveries.length === 0) {
      return
    }
    // Le point de chute est celui du panier : une tournée n'en a qu'un, c'est
    // toute la raison pour laquelle elle existe.
    const checkout = await this.em.findOne(Checkout, { id: run.checkout.id })
    run.pickupOrder = orderPickups(
      deliveries.map(delivery => ({
        id: delivery.id,
        latitude: delivery.pickupLatitude ?? null,
        longitude: delivery.pickupLongitude ?? null,
      })),
      origin,
      { latitude: checkout?.deliveryLatitude ?? null, longitude: checkout?.deliveryLongitude ?? null },
    )
    await this.em.flush()
  }

  /** Dernière position connue d'un livreur, si elle est encore fraîche. */
  private async courierPosition(courierId: string): Promise<{ latitude: number, longitude: number } | null> {
    const rows = await this.em.getConnection().execute(
      `SELECT ST_Y(last_known_location::geometry) AS latitude,
              ST_X(last_known_location::geometry) AS longitude
       FROM courier_profiles
       WHERE id = ? AND last_known_location IS NOT NULL
         AND last_location_at > NOW() - INTERVAL '12 hours'`,
      [courierId],
    ) as Array<{ latitude: number | string, longitude: number | string }>
    if (rows.length === 0) {
      return null
    }
    return { latitude: Number(rows[0].latitude), longitude: Number(rows[0].longitude) }
  }

  /**
   * Un livreur prend une tournée entière. Comme pour une course isolée, la
   * garde `courier_id IS NULL` est le verrou : le premier à écrire gagne.
   *
   * L'acceptation porte sur le tout — c'est FR-015, et c'est ce qui rend le
   * frais unique tenable. Les livraisons suivent la tournée, elles ne sont pas
   * acceptées une à une.
   */
  async acceptRun(runId: string, userId: string): Promise<DeliveryRun> {
    const profile = await this.getMyProfile(userId)
    if (profile.validationStatus !== ValidationStatus.VALIDATED || !profile.isAvailable) {
      throw new ForbiddenException('Passez disponible pour accepter une tournée')
    }
    await this.assertNotBlocked(profile.id)

    const claimed = await this.em.getConnection().execute(
      `UPDATE delivery_runs
       SET courier_id = ?, status = 'ACCEPTED', accepted_at = NOW(),
           offered_to_courier_id = NULL, offer_expires_at = NULL, outcome = 'ACCEPTED', "updatedAt" = NOW()
       WHERE id = ? AND courier_id IS NULL AND status = 'AWAITING_COURIER'
         AND (dispatch_phase = 'BROADCAST' OR (offered_to_courier_id = ? AND offer_expires_at > NOW()))
       RETURNING id`,
      [profile.id, runId, profile.id],
    )

    if (claimed.length === 0) {
      const existing = await this.em.findOne(DeliveryRun, { id: runId })
      if (!existing) {
        throw new NotFoundException('Tournée introuvable')
      }
      if (existing.status === DeliveryRunStatus.CANCELLED) {
        throw new GoneException('Cette tournée a été annulée')
      }
      if (existing.status === DeliveryRunStatus.AWAITING_COURIER) {
        throw new ConflictException('Cette tournée est proposée à un autre livreur pour le moment')
      }
      throw new ConflictException('Cette tournée a déjà été prise par un autre livreur')
    }

    await this.dispatchService.respondToRunOffer(runId, profile.id, DeliveryOfferResponse.ACCEPTED)

    // `refresh` n'est pas un détail : la prise est écrite en SQL brut, donc
    // l'entité déjà chargée dans le contexte porte encore l'état d'avant. Sans
    // relecture, l'appelant reçoit une tournée « en attente » qu'il vient
    // pourtant d'accepter.
    const run = await this.em.findOne(DeliveryRun, { id: runId }, { populate: ['deliveries'], refresh: true })
    if (!run) {
      throw new NotFoundException('Tournée introuvable')
    }

    // L'ordre de passage se fige maintenant : c'est le seul moment où l'on
    // sait d'où le livreur part.
    await this.applyPickupOrder(run, await this.courierPosition(profile.id))

    // Chaque livraison suit sa tournée. Le statut par commande ne change pas
    // de forme — c'est ce qui laisse l'app fournisseur intacte.
    const deliveries = run.deliveries.getItems()
    for (const delivery of deliveries) {
      delivery.courier = profile
      delivery.status = DeliveryStatus.ACCEPTED
      delivery.acceptedAt = new Date()
      delivery.offeredToCourier = null
      delivery.offerExpiresAt = null
      this.em.create(DeliveryEvent, {
        delivery,
        type: DeliveryEventType.ACCEPTED,
        actorUserId: userId,
        payload: { courierId: profile.id, deliveryRunId: run.id },
      })
      await this.dispatchService.cancelPendingOffer(delivery.id)
    }
    await this.em.flush()

    await Promise.all(deliveries.map(async (delivery) => {
      const loaded = await this.loadDelivery(delivery.id)
      const supplierUser = await this.resolveSupplierUser(loaded.order)
      await Promise.all([
        supplierUser
          ? this.notificationsService.send({
              user: supplierUser,
              type: NotificationType.DELIVERY_ASSIGNED,
              title: 'Livreur trouvé',
              body: `${profile.fullName} prend en charge la commande ${loaded.order.orderNumber}`,
              data: { deliveryId: loaded.id, orderId: loaded.order.id, deliveryRunId: run.id },
              channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
            })
          : Promise.resolve(),
        this.notificationsService.send({
          user: loaded.order.buyer,
          type: NotificationType.DELIVERY_ASSIGNED,
          title: 'Livreur en route',
          body: `${profile.fullName} livrera votre commande ${loaded.order.orderNumber}`,
          data: { deliveryId: loaded.id, orderId: loaded.order.id, deliveryRunId: run.id },
          channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
        }),
      ])
    }))

    return run
  }

  /** Le livreur sollicité passe : le suivant du classement est sollicité. */
  async declineRun(runId: string, userId: string): Promise<void> {
    const profile = await this.getMyProfile(userId)
    const run = await this.em.findOne(DeliveryRun, { id: runId })
    if (!run) {
      throw new NotFoundException('Tournée introuvable')
    }
    await this.dispatchService.respondToRunOffer(runId, profile.id, DeliveryOfferResponse.DECLINED)
  }

  /** The targeted courier passes: the next ranked courier is asked at once. */
  async decline(deliveryId: string, userId: string): Promise<void> {
    const profile = await this.getMyProfile(userId)
    const delivery = await this.em.findOne(Delivery, { id: deliveryId })
    if (!delivery) {
      throw new NotFoundException('Delivery not found')
    }
    if (delivery.status !== DeliveryStatus.AWAITING_COURIER || delivery.offeredToCourier?.id !== profile.id) {
      throw new ConflictException('Cette course ne vous est plus proposée')
    }
    await this.dispatchService.respondToOffer(deliveryId, profile.id, DeliveryOfferResponse.DECLINED)
  }

  async pickup(deliveryId: string, userId: string, occurredAt?: string): Promise<Delivery> {
    const delivery = await this.loadOwnedDelivery(deliveryId, userId)
    this.assertStatus(delivery, DeliveryStatus.ACCEPTED)
    if (delivery.order.status === OrderStatus.PREPARING || delivery.order.status === OrderStatus.ACCEPTED) {
      throw new ConflictException('La commande n\'est pas encore prête : la boutique doit d\'abord la marquer prête')
    }

    const when = await this.clampOccurredAt(delivery, occurredAt)
    delivery.status = DeliveryStatus.PICKED_UP
    delivery.pickedUpAt = when
    delivery.confirmationCode = String(randomInt(0, 10000)).padStart(4, '0')

    this.em.create(DeliveryEvent, {
      delivery,
      type: DeliveryEventType.PICKED_UP,
      actorUserId: userId,
      occurredAt: when,
    })
    await this.em.flush()

    await this.ordersService.applyStatusFromDelivery(delivery.order.id, OrderStatus.IN_DELIVERY)

    await this.notificationsService.send({
      user: delivery.order.buyer,
      type: NotificationType.DELIVERY_PICKED_UP,
      title: 'Commande en route',
      body: `Votre commande ${delivery.order.orderNumber} a été récupérée. Code de confirmation : ${delivery.confirmationCode}`,
      data: { deliveryId: delivery.id, orderId: delivery.order.id, confirmationCode: delivery.confirmationCode },
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    })

    return delivery
  }

  /**
   * La tournée en cours du livreur, avec ses collectes dans l'ordre de passage.
   *
   * Le livreur a besoin d'un seul écran : sans cela, ses deux collectes
   * apparaissent comme deux courses sans lien, et rien ne lui dit par où
   * commencer ni qu'une seule remise l'attend au bout.
   */
  async getMyActiveRun(userId: string): Promise<ActiveRunRow | null> {
    const profile = await this.getMyProfile(userId)
    const rows = await this.em.getConnection().execute(
      `SELECT r.id, r.status, r.shop_count, r.courier_earning, r.delivery_fee,
              r.total_distance_km, r.confirmation_code, r.pickup_order,
              c.delivery_address AS dropoff_address,
              c.delivery_latitude AS dropoff_latitude, c.delivery_longitude AS dropoff_longitude,
              c.payment_method, c.total_amount,
              (SELECT jsonb_agg(stop ORDER BY stop->>'position')
               FROM (
                 SELECT jsonb_build_object(
                   'deliveryId', d.id,
                   'orderId', o.id,
                   'orderNumber', o.order_number,
                   'shopName', s.shop_name,
                   'pickupAddress', d.pickup_address,
                   'pickupLatitude', d.pickup_latitude,
                   'pickupLongitude', d.pickup_longitude,
                   'status', d.status,
                   'itemsCount', (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id),
                   'position', LPAD(COALESCE(
                     array_position(ARRAY(SELECT jsonb_array_elements_text(r.pickup_order))::uuid[], d.id),
                     99
                   )::text, 2, '0')
                 ) AS stop
                 FROM deliveries d
                 JOIN orders o ON o.id = d.order_id
                 JOIN suppliers s ON s.id = o.supplier_id
                 WHERE d.delivery_run_id = r.id
               ) ordered) AS stops
       FROM delivery_runs r
       JOIN checkouts c ON c.id = r.checkout_id
       WHERE r.courier_id = ?
         AND r.status IN ('ACCEPTED', 'COLLECTING', 'DELIVERING')
       ORDER BY r."updatedAt" DESC
       LIMIT 1`,
      [profile.id],
    ) as ActiveRunRow[]
    return rows[0] ?? null
  }

  /**
   * Collecte chez une boutique d'une tournée.
   *
   * Le statut ne bouge que pour **cette** commande (FR-017) : la boutique voit
   * sa commande partir, les autres continuent d'attendre le livreur. C'est ce
   * qui laisse l'app fournisseur inchangée — elle ne sait pas qu'une tournée
   * existe, et elle n'a pas à le savoir.
   *
   * Le code de remise, lui, est celui de la tournée : tiré à la première
   * collecte, annoncé à l'acheteur quand tout est chargé.
   */
  async collect(deliveryId: string, userId: string, occurredAt?: string): Promise<Delivery> {
    const delivery = await this.loadOwnedDelivery(deliveryId, userId)
    const run = delivery.deliveryRun
      ? await this.em.findOne(DeliveryRun, { id: delivery.deliveryRun.id }, { populate: ['deliveries'] })
      : null
    if (!run) {
      // Course isolée : rien de neuf, c'est le retrait d'avant les tournées.
      return this.pickup(deliveryId, userId, occurredAt)
    }

    this.assertStatus(delivery, DeliveryStatus.ACCEPTED)
    if (delivery.order.status === OrderStatus.PREPARING || delivery.order.status === OrderStatus.ACCEPTED) {
      throw new ConflictException('La commande n\'est pas encore prête : la boutique doit d\'abord la marquer prête')
    }

    const when = await this.clampOccurredAt(delivery, occurredAt)
    run.confirmationCode = run.confirmationCode ?? String(randomInt(0, 10000)).padStart(4, '0')
    if (run.status === DeliveryRunStatus.ACCEPTED) {
      run.status = DeliveryRunStatus.COLLECTING
      run.collectingAt = when
    }

    delivery.status = DeliveryStatus.PICKED_UP
    delivery.pickedUpAt = when
    // Le code est recopié sur chaque course pour que les écrans par commande,
    // qui ignorent la tournée, continuent de l'afficher.
    delivery.confirmationCode = run.confirmationCode
    this.em.create(DeliveryEvent, {
      delivery,
      type: DeliveryEventType.PICKED_UP,
      actorUserId: userId,
      occurredAt: when,
      payload: { deliveryRunId: run.id },
    })
    await this.em.flush()

    await this.ordersService.applyStatusFromDelivery(delivery.order.id, OrderStatus.IN_DELIVERY)

    const siblings = run.deliveries.getItems()
    const allCollected = siblings.every(item => item.status !== DeliveryStatus.ACCEPTED)
    if (!allCollected) {
      return delivery
    }

    // Tout est chargé : la tournée roule, et l'acheteur reçoit son code — une
    // seule fois, pas une par boutique.
    run.status = DeliveryRunStatus.DELIVERING
    run.deliveringAt = when
    for (const item of siblings) {
      if (item.status === DeliveryStatus.PICKED_UP) {
        item.status = DeliveryStatus.IN_TRANSIT
        item.inTransitAt = when
        this.em.create(DeliveryEvent, {
          delivery: item,
          type: DeliveryEventType.IN_TRANSIT,
          actorUserId: userId,
          occurredAt: when,
          payload: { deliveryRunId: run.id },
        })
      }
    }
    await this.em.flush()

    await this.notificationsService.send({
      user: delivery.order.buyer,
      type: NotificationType.DELIVERY_PICKED_UP,
      title: 'Commande en route',
      body: run.shopCount > 1
        ? `Vos ${run.shopCount} commandes sont récupérées. Code de confirmation : ${run.confirmationCode}`
        : `Votre commande ${delivery.order.orderNumber} a été récupérée. Code de confirmation : ${run.confirmationCode}`,
      data: { deliveryRunId: run.id, deliveryId: delivery.id, confirmationCode: run.confirmationCode },
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    })

    return delivery
  }

  /**
   * Remise d'une tournée : un code, toutes les commandes livrées.
   *
   * L'acheteur n'a qu'un colis en main, il ne récite pas un code par boutique.
   * Le règlement du livreur se fait ici, une fois, sur le frais de la tournée —
   * les commandes d'un panier unifié portent zéro, et un règlement par commande
   * ne lui paierait rien.
   */
  async deliverRun(runId: string, userId: string, data: CompleteDelivery): Promise<DeliveryRun> {
    const profile = await this.getMyProfile(userId)
    const run = await this.em.findOne(DeliveryRun, { id: runId }, { populate: ['deliveries', 'courier'] })
    if (!run) {
      throw new NotFoundException('Tournée introuvable')
    }
    if (run.courier?.id !== profile.id) {
      throw new ForbiddenException('Cette tournée ne vous appartient pas')
    }
    if (run.status !== DeliveryRunStatus.DELIVERING) {
      throw new BadRequestException('Toutes les boutiques doivent être collectées avant la remise')
    }

    const cash = await this.isRunCash(run)
    if (data.proofType === 'CODE') {
      if (!run.confirmationCode || run.confirmationCode !== data.code) {
        throw new UnprocessableEntityException('Code de confirmation invalide')
      }
    }
    else if (cash) {
      // Le code est le reçu de l'acheteur pour l'argent remis : pas de photo.
      throw new UnprocessableEntityException('Une tournée payée en espèces se clôture avec le code de confirmation du client')
    }

    const when = new Date()
    // La preuve vaut pour la tournée entière : une remise, une preuve. Chaque
    // course la porte tout de même, parce que les écrans par commande la lisent.
    const proofType = data.proofType === 'CODE' ? DeliveryProofType.CODE : DeliveryProofType.PHOTO
    const proofMediaId = data.proofType === 'PHOTO' ? data.mediaId : null
    for (const delivery of run.deliveries.getItems()) {
      if (delivery.status === DeliveryStatus.DELIVERED) {
        continue
      }
      delivery.status = DeliveryStatus.DELIVERED
      delivery.deliveredAt = when
      delivery.proofType = proofType
      if (proofMediaId) {
        delivery.proofMediaId = proofMediaId
      }
      this.em.create(DeliveryEvent, {
        delivery,
        type: DeliveryEventType.DELIVERED,
        actorUserId: userId,
        occurredAt: when,
        payload: { proofType, deliveryRunId: run.id },
      })
    }
    run.status = DeliveryRunStatus.DELIVERED
    run.deliveredAt = when
    await this.em.flush()

    // L'argent du livreur d'abord : un échec ici est journalisé, jamais
    // remonté — la marchandise est remise, quoi qu'en dise le grand livre.
    await this.settleRunWallet(run, cash)

    for (const delivery of run.deliveries.getItems()) {
      await this.ordersService.applyStatusFromDelivery(delivery.order.id, OrderStatus.DELIVERED)
    }

    return run
  }

  /** Une tournée est en espèces quand son passage en caisse l'est. */
  private async isRunCash(run: DeliveryRun): Promise<boolean> {
    const checkout = await this.em.findOne(Checkout, { id: run.checkout.id })
    return checkout?.paymentMethod === PaymentMethod.CASH_ON_DELIVERY
  }

  /**
   * Règle une tournée avec le portefeuille du livreur, une fois pour toutes.
   *
   * En ligne : l'acheteur a payé les frais à la plateforme, le livreur est
   * crédité de sa part. En espèces : il a gardé tout le frais à la porte, donc
   * la part d'eBio lui est débitée — le solde peut passer sous zéro, c'est à
   * cela que servent les recharges. Rejouable : l'écriture porte la tournée.
   */
  private async settleRunWallet(run: DeliveryRun, isCash: boolean): Promise<void> {
    const courier = run.courier
    if (!courier) {
      return
    }
    try {
      const already = await this.em.getConnection().execute(
        `SELECT 1 FROM wallet_transactions
         WHERE delivery_run_id = ? AND type IN ('DELIVERY_EARNING', 'DELIVERY_COMMISSION') LIMIT 1`,
        [run.id],
      )
      if (already.length > 0) {
        return
      }

      const deliveryFee = Math.round(run.deliveryFee)
      const courierFee = Math.round(run.courierEarning)
      const amount = isCash ? deliveryFee - courierFee : courierFee
      if (!(amount > 0)) {
        return
      }

      const label = run.shopCount > 1 ? `tournée de ${run.shopCount} boutiques` : 'course'
      const wallet = await this.walletService.getOrCreate({ courierId: courier.id })
      if (isCash) {
        await this.walletService.debit(wallet.id, {
          type: WalletTransactionType.DELIVERY_COMMISSION,
          amount,
          description: `Commission eBio sur la ${label}`,
          deliveryRunId: run.id,
          allowNegative: true,
        })
      }
      else {
        await this.walletService.credit(wallet.id, {
          type: WalletTransactionType.DELIVERY_EARNING,
          amount,
          description: `Gain de la ${label}`,
          deliveryRunId: run.id,
        })
      }

      await this.walletService.post(PlatformAccount.DELIVERY_COMMISSION, 'credit', {
        type: WalletTransactionType.PLATFORM_DELIVERY_SHARE,
        amount: deliveryFee - courierFee,
        description: `Part eBio sur la ${label}`,
        deliveryRunId: run.id,
      })

      const formatted = amount.toLocaleString('fr-FR')
      const courierUser = await this.em.findOneOrFail(User, { id: courier.user.id })
      await this.notificationsService.send({
        user: courierUser,
        type: NotificationType.COURIER_EARNING,
        title: 'Tournée réglée',
        body: isCash
          ? `Commission de ${formatted} FCFA prélevée sur votre portefeuille`
          : `+${formatted} FCFA crédités sur votre portefeuille`,
        data: { deliveryRunId: run.id, amount: isCash ? -amount : amount },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      })
    }
    catch (error) {
      this.logger.error(
        `Courier wallet settlement failed for run ${run.id}`,
        error instanceof Error ? error.stack : String(error),
      )
    }
  }

  async start(deliveryId: string, userId: string, occurredAt?: string): Promise<Delivery> {
    const delivery = await this.loadOwnedDelivery(deliveryId, userId)
    if (delivery.deliveryRun) {
      // Une tournée part quand la dernière boutique est collectée, pas avant :
      // la décision appartient à la tournée, pas à l'une de ses courses.
      throw new ConflictException('Cette course fait partie d\'une tournée : elle démarre quand toutes les boutiques sont collectées')
    }
    this.assertStatus(delivery, DeliveryStatus.PICKED_UP)

    const when = await this.clampOccurredAt(delivery, occurredAt)
    delivery.status = DeliveryStatus.IN_TRANSIT
    delivery.inTransitAt = when

    this.em.create(DeliveryEvent, {
      delivery,
      type: DeliveryEventType.IN_TRANSIT,
      actorUserId: userId,
      occurredAt: when,
    })
    await this.em.flush()
    return delivery
  }

  async complete(deliveryId: string, userId: string, data: CompleteDelivery): Promise<Delivery> {
    const delivery = await this.loadOwnedDelivery(deliveryId, userId)
    if (delivery.deliveryRun) {
      // Clore une course seule réglerait le livreur sur un frais nul — les
      // commandes d'un panier unifié en portent zéro, le frais est sur la
      // tournée. La remise se fait d'un bloc, avec un seul code.
      throw new ConflictException('Cette course fait partie d\'une tournée : remettez la tournée entière')
    }
    this.assertStatus(delivery, DeliveryStatus.IN_TRANSIT)

    if (data.proofType === 'CODE') {
      if (delivery.confirmationCode !== data.code) {
        throw new UnprocessableEntityException('Code de confirmation invalide')
      }
      delivery.proofType = DeliveryProofType.CODE
    }
    else if (delivery.order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY) {
      // The code is the buyer's receipt for the cash handed over: no photo shortcut.
      throw new UnprocessableEntityException('Une commande payée en espèces se clôture avec le code de confirmation du client')
    }
    else {
      delivery.proofType = DeliveryProofType.PHOTO
      delivery.proofMediaId = data.mediaId
    }

    const when = await this.clampOccurredAt(delivery, data.occurredAt)
    delivery.status = DeliveryStatus.DELIVERED
    delivery.deliveredAt = when

    this.em.create(DeliveryEvent, {
      delivery,
      type: DeliveryEventType.DELIVERED,
      actorUserId: userId,
      occurredAt: when,
      payload: { proofType: delivery.proofType },
    })
    await this.em.flush()

    // The courier's money first: a failure here is logged, never surfaced —
    // the parcel is delivered whatever the ledger says.
    await this.settleCourierWallet(delivery)

    // ORDER_DELIVERED notification, cash commission and deliveredAt all come
    // from the existing order machinery.
    await this.ordersService.applyStatusFromDelivery(delivery.order.id, OrderStatus.DELIVERED)

    return delivery
  }

  /**
   * Settles the delivery fee with the courier wallet once the run is done.
   * Paid online: the buyer's fee sits on the platform account, the courier
   * is credited their share. Cash: the courier pocketed the whole fee at the
   * door, so eBio's cut is debited (the balance may go negative — that is
   * what top-ups are for). Idempotent on wallet_transactions.delivery_id.
   */
  private async settleCourierWallet(delivery: Delivery): Promise<void> {
    const courier = delivery.courier
    if (!courier) {
      return
    }
    try {
      const already = await this.em.getConnection().execute(
        `SELECT 1 FROM wallet_transactions
         WHERE delivery_id = ? AND type IN ('DELIVERY_EARNING', 'DELIVERY_COMMISSION') LIMIT 1`,
        [delivery.id],
      )
      if (already.length > 0) {
        return
      }

      const order = delivery.order
      const isCash = order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY
      const deliveryFee = Math.round(delivery.deliveryFee ?? 0)
      const courierFee = Math.round(delivery.courierFee ?? 0)
      // Sponsored delivery: the buyer handed over no fee, so the courier is
      // credited their share like an online run and the sponsor is charged.
      const sponsored = order.deliverySponsor != null && order.sponsoredDeliveryFee > 0
      const amount = isCash && !sponsored ? deliveryFee - courierFee : courierFee
      if (!(amount > 0)) {
        return
      }

      const wallet = await this.walletService.getOrCreate({ courierId: courier.id })
      if (sponsored && order.deliverySponsor === 'SUPPLIER') {
        const shopWallet = await this.walletService.getOrCreate({ supplierId: order.supplier.id })
        await this.walletService.debit(shopWallet.id, {
          type: WalletTransactionType.DELIVERY_SPONSORSHIP,
          amount: deliveryFee,
          description: `Livraison offerte (promotion) — commande #${order.orderNumber}`,
          orderId: order.id,
          deliveryId: delivery.id,
          allowNegative: true,
        })
      }
      if (isCash && !sponsored) {
        await this.walletService.debit(wallet.id, {
          type: WalletTransactionType.DELIVERY_COMMISSION,
          amount,
          description: `Commission eBio sur la course — commande #${order.orderNumber}`,
          orderId: order.id,
          deliveryId: delivery.id,
          allowNegative: true,
        })
      }
      else {
        await this.walletService.credit(wallet.id, {
          type: WalletTransactionType.DELIVERY_EARNING,
          amount,
          description: `Gain de la course — commande #${order.orderNumber}`,
          orderId: order.id,
          deliveryId: delivery.id,
        })
      }

      // eBio's own books: its share of the fee, or what an offered delivery
      // costs it when the platform is the sponsor.
      if (sponsored && order.deliverySponsor === 'PLATFORM') {
        await this.walletService.post(PlatformAccount.MARKETING, 'debit', {
          type: WalletTransactionType.PLATFORM_MARKETING,
          amount: courierFee,
          description: `Livraison offerte par eBio — commande #${order.orderNumber}`,
          orderId: order.id,
          deliveryId: delivery.id,
        })
      }
      else {
        await this.walletService.post(PlatformAccount.DELIVERY_COMMISSION, 'credit', {
          type: WalletTransactionType.PLATFORM_DELIVERY_SHARE,
          amount: deliveryFee - courierFee,
          description: `Part eBio sur la livraison — commande #${order.orderNumber}`,
          orderId: order.id,
          deliveryId: delivery.id,
        })
      }

      const formatted = amount.toLocaleString('fr-FR')
      const courierUser = await this.em.findOneOrFail(User, { id: courier.user.id })
      await this.notificationsService.send({
        user: courierUser,
        type: NotificationType.COURIER_EARNING,
        title: 'Course réglée',
        body: isCash && !sponsored
          ? `Commission de ${formatted} FCFA prélevée sur votre portefeuille`
          : `+${formatted} FCFA crédités sur votre portefeuille`,
        data: { deliveryId: delivery.id, orderId: order.id, amount: isCash && !sponsored ? -amount : amount },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      })
    }
    catch (error) {
      this.logger.error(
        `Courier wallet settlement failed for delivery ${delivery.id}`,
        error instanceof Error ? error.stack : String(error),
      )
    }
  }

  async fail(deliveryId: string, userId: string, data: FailDelivery): Promise<Delivery> {
    const delivery = await this.loadOwnedDelivery(deliveryId, userId)
    if (!ACTIVE_STATUSES.includes(delivery.status)) {
      throw new BadRequestException(`Cannot fail a delivery in status ${delivery.status}`)
    }

    const when = await this.clampOccurredAt(delivery, data.occurredAt)
    delivery.status = DeliveryStatus.FAILED
    delivery.failedAt = when
    delivery.failReason = data.reason as DeliveryFailReason
    delivery.failComment = data.comment

    this.em.create(DeliveryEvent, {
      delivery,
      type: DeliveryEventType.FAILED,
      actorUserId: userId,
      occurredAt: when,
      payload: { reason: data.reason, comment: data.comment ?? null },
    })
    await this.em.flush()

    const supplierUser = await this.resolveSupplierUser(delivery.order)
    if (supplierUser) {
      await this.notificationsService.send({
        user: supplierUser,
        type: NotificationType.DELIVERY_FAILED,
        title: 'Échec de livraison',
        body: `La livraison de la commande ${delivery.order.orderNumber} a échoué (${this.failReasonLabel(data.reason)})`,
        data: { deliveryId: delivery.id, orderId: delivery.order.id, reason: data.reason },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      })
    }

    return delivery
  }

  async getMine(userId: string, filter?: 'active' | 'done'): Promise<Delivery[]> {
    const profile = await this.getMyProfile(userId)
    const statuses = filter === 'active'
      ? ACTIVE_STATUSES
      : filter === 'done'
        ? [DeliveryStatus.DELIVERED, DeliveryStatus.FAILED]
        : undefined

    return this.em.find(Delivery, {
      courier: { id: profile.id },
      ...(statuses ? { status: { $in: statuses } } : {}),
    }, {
      populate: ['order', 'order.buyer', 'order.supplier', 'order.items', 'courier'],
      orderBy: { updatedAt: 'DESC' },
    })
  }

  /** Loads a delivery and resolves what the requester is allowed to see. */
  async getForRequester(deliveryId: string, userId: string): Promise<{ delivery: Delivery, audience: DeliveryAudience }> {
    const delivery = await this.loadDelivery(deliveryId)
    return { delivery, audience: await this.resolveAudience(delivery, userId) }
  }

  async getByOrderForRequester(orderId: string, userId: string): Promise<{ delivery: Delivery, audience: DeliveryAudience }> {
    const found = await this.em.findOne(Delivery, { order: { id: orderId } })
    if (!found) {
      throw new NotFoundException('No delivery for this order')
    }
    const delivery = await this.loadDelivery(found.id)
    return { delivery, audience: await this.resolveAudience(delivery, userId) }
  }

  async getEvents(deliveryId: string): Promise<DeliveryEvent[]> {
    return this.em.find(DeliveryEvent, { delivery: { id: deliveryId } }, { orderBy: { occurredAt: 'ASC' } })
  }

  /** Supplier-triggered manual rebroadcast (widened radius). */
  async rebroadcast(deliveryId: string, userId: string): Promise<Delivery> {
    const delivery = await this.loadDelivery(deliveryId)
    const supplierUser = await this.resolveSupplierUser(delivery.order)
    if (supplierUser?.id !== userId) {
      throw new ForbiddenException('Only the shop owner can rebroadcast this delivery')
    }
    if (delivery.status !== DeliveryStatus.AWAITING_COURIER) {
      throw new ConflictException('Cette course a déjà un livreur')
    }

    delivery.broadcastRadiusKm = Math.min(delivery.broadcastRadiusKm + 5, 25)
    delivery.offeredAt = new Date()
    delivery.dispatchPhase = DispatchPhase.BROADCAST
    await this.em.flush()
    await this.dispatchService.cancelPendingOffer(delivery.id)
    await this.dispatchService.broadcast(delivery.id)
    return delivery
  }

  // ===== Order-side hooks (called by OrdersService) =====

  /**
   * The supplier advances READY → IN_DELIVERY manually (self-delivery). An
   * unclaimed delivery is closed and withdrawn from courier lists; a claimed
   * one blocks the manual move — a courier is already on it.
   */
  async handleSupplierTakeover(order: Order): Promise<void> {
    const delivery = await this.em.findOne(Delivery, { order: { id: order.id } })
    if (!delivery) {
      return
    }
    if (delivery.status === DeliveryStatus.AWAITING_COURIER) {
      delivery.status = DeliveryStatus.CANCELLED
      this.em.create(DeliveryEvent, {
        delivery,
        type: DeliveryEventType.SELF_DELIVERED,
      })
      await this.em.flush()
      return
    }
    if (ACTIVE_STATUSES.includes(delivery.status)) {
      throw new ConflictException('Un livreur a déjà pris cette course en charge')
    }
  }

  /**
   * The order reached DELIVERED through another actor (buyer confirmation,
   * supplier or admin status change) while a courier delivery still exists.
   * The parcel is in the buyer's hands whatever the courier app says, so the
   * run is closed as delivered and the courier is paid exactly as if they had
   * entered the proof themselves. An unclaimed run means the shop delivered
   * by itself: it is withdrawn instead.
   */
  async closeForOrder(order: Order): Promise<void> {
    const delivery = await this.em.findOne(Delivery, { order: { id: order.id } }, {
      populate: ['order', 'courier', 'courier.user'],
    })
    if (!delivery) {
      return
    }
    if (delivery.status === DeliveryStatus.AWAITING_COURIER) {
      delivery.status = DeliveryStatus.CANCELLED
      this.em.create(DeliveryEvent, {
        delivery,
        type: DeliveryEventType.SELF_DELIVERED,
      })
      await this.em.flush()
      return
    }
    if (!ACTIVE_STATUSES.includes(delivery.status) || !delivery.courier) {
      return
    }

    const when = new Date()
    delivery.status = DeliveryStatus.DELIVERED
    delivery.deliveredAt = when
    this.em.create(DeliveryEvent, {
      delivery,
      type: DeliveryEventType.DELIVERED,
      occurredAt: when,
      payload: { source: 'ORDER' },
    })
    await this.em.flush()

    await this.settleCourierWallet(delivery)
  }

  /** Order cancelled while a delivery exists: close it and warn the courier. */
  async cancelForOrder(order: Order): Promise<void> {
    const delivery = await this.em.findOne(Delivery, { order: { id: order.id } }, {
      populate: ['courier', 'courier.user'],
    })
    if (!delivery || delivery.status === DeliveryStatus.CANCELLED || delivery.status === DeliveryStatus.DELIVERED) {
      return
    }

    const assignedCourier = delivery.courier
    await this.dispatchService.cancelPendingOffer(delivery.id)
    delivery.status = DeliveryStatus.CANCELLED
    this.em.create(DeliveryEvent, {
      delivery,
      type: DeliveryEventType.ORDER_CANCELLED,
    })
    await this.em.flush()

    if (assignedCourier) {
      await this.notificationsService.send({
        user: assignedCourier.user,
        type: NotificationType.ORDER_CANCELLED,
        title: 'Course annulée',
        body: `La commande ${order.orderNumber} a été annulée. La course est retirée de votre liste.`,
        data: { deliveryId: delivery.id },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      })
    }
  }

  // ===== Helpers =====

  private async loadDelivery(deliveryId: string): Promise<Delivery> {
    const delivery = await this.em.findOne(Delivery, { id: deliveryId }, {
      populate: ['order', 'order.buyer', 'order.supplier', 'order.items', 'courier'],
    })
    if (!delivery) {
      throw new NotFoundException('Delivery not found')
    }
    return delivery
  }

  private async loadOwnedDelivery(deliveryId: string, userId: string): Promise<Delivery> {
    const delivery = await this.loadDelivery(deliveryId)
    if (delivery.courier?.user?.id !== userId) {
      const profile = await this.em.findOne(CourierProfile, { user: { id: userId } })
      if (!profile || delivery.courier?.id !== profile.id) {
        throw new ForbiddenException('This delivery is not assigned to you')
      }
    }
    return delivery
  }

  private assertStatus(delivery: Delivery, expected: DeliveryStatus): void {
    if (delivery.status !== expected) {
      throw new BadRequestException(`Cannot transition from ${delivery.status} (expected ${expected})`)
    }
  }

  /**
   * Bounds an offline-replayed timestamp: never in the future, never before
   * the latest journaled event.
   */
  private async clampOccurredAt(delivery: Delivery, occurredAt?: string): Promise<Date> {
    const now = new Date()
    if (!occurredAt) {
      return now
    }
    const requested = new Date(occurredAt)
    const lastEvents = await this.em.find(DeliveryEvent, { delivery: { id: delivery.id } }, {
      orderBy: { occurredAt: 'DESC' },
      limit: 1,
    })
    const floor = lastEvents[0]?.occurredAt ?? delivery.createdAt
    if (requested.getTime() > now.getTime()) {
      return now
    }
    if (requested.getTime() < floor.getTime()) {
      return floor
    }
    return requested
  }

  private async resolveAudience(delivery: Delivery, userId: string): Promise<DeliveryAudience> {
    const user = await this.em.findOne(User, { id: userId })
    if (user?.role === UserRole.ADMIN) {
      return 'admin'
    }
    if (delivery.order.buyer.id === userId) {
      return 'buyer'
    }
    const supplierUser = await this.resolveSupplierUser(delivery.order)
    if (supplierUser?.id === userId) {
      return 'supplier'
    }
    if (delivery.courier) {
      const profile = await this.em.findOne(CourierProfile, { user: { id: userId } })
      if (profile && delivery.courier.id === profile.id) {
        return 'courier'
      }
    }
    throw new ForbiddenException('You are not a party to this delivery')
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

  private failReasonLabel(reason: string): string {
    const labels: Record<string, string> = {
      CUSTOMER_ABSENT: 'client absent',
      ADDRESS_NOT_FOUND: 'adresse introuvable',
      CUSTOMER_REFUSED: 'refus du client',
      OTHER: 'autre motif',
    }
    return labels[reason] ?? reason
  }
}
