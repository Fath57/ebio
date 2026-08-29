import type {
  CompleteDelivery,
  FailDelivery,
  RegisterCourier,
  UpdateCourier,
} from './contracts/delivery.contract'
import type { DeliveryAudience, OfferRow } from './deliveries.mapper'
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
import { computeCourierFee } from '../../common/delivery-fee'
import { User, UserRole } from '../auth/auth.entity'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { Order, OrderStatus, PaymentMethod } from '../orders/entities/order.entity'
import { OrdersService } from '../orders/orders.service'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { ValidationStatus } from '../suppliers/supplier.entity'
import { WalletTransactionType } from '../wallet/entities/wallet-transaction.entity'
import { WalletService } from '../wallet/wallet.service'
import { DispatchService } from './dispatch.service'
import { CourierProfile, VehicleType } from './entities/courier-profile.entity'
import { DeliveryEvent, DeliveryEventType } from './entities/delivery-event.entity'
import { Delivery, DeliveryFailReason, DeliveryProofType, DeliveryStatus } from './entities/delivery.entity'

const ACTIVE_STATUSES = [DeliveryStatus.ACCEPTED, DeliveryStatus.PICKED_UP, DeliveryStatus.IN_TRANSIT]

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
  async createForOrder(order: Order): Promise<Delivery | null> {
    const existing = await this.em.findOne(Delivery, { order: { id: order.id } })
    if (existing) {
      return existing
    }

    const supplier = order.supplier
    const deliveryFee = order.deliveryFee ?? 0
    const rate = await this.platformSettings.getDeliveryCommissionRate()
    const delivery = this.em.create(Delivery, {
      order,
      pickupAddress: supplier.address ?? supplier.shopName,
      dropoffAddress: order.deliveryAddress ?? '',
      offeredAt: new Date(),
      deliveryFee,
      courierFee: computeCourierFee(deliveryFee, rate),
    })
    this.em.create(DeliveryEvent, {
      delivery,
      type: DeliveryEventType.CREATED,
      payload: { orderNumber: order.orderNumber },
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

    try {
      await this.dispatchService.broadcast(delivery.id)
    }
    catch (error) {
      // A failed push must not block the READY transition; the cron rebroadcasts.
      this.logger.error(`Initial broadcast failed for delivery ${delivery.id}`, error instanceof Error ? error.stack : String(error))
    }

    return delivery
  }

  async getOffers(userId: string): Promise<OfferRow[]> {
    const profile = await this.getMyProfile(userId)
    if (profile.validationStatus !== ValidationStatus.VALIDATED || !profile.isAvailable) {
      throw new ForbiddenException('Passez disponible pour voir les courses proposées')
    }

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
              s.shop_name, o.total_amount, d.delivery_fee, d.courier_fee,
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
         AND (
           d.pickup_location IS NULL
           OR (me.loc IS NOT NULL AND ST_DWithin(d.pickup_location, me.loc, GREATEST(d.broadcast_radius_km * 1000, me.zone_radius_m)))
         )
       ORDER BY distance_km ASC NULLS LAST, d.offered_at ASC`,
      [profile.id],
    )
  }

  /** First-write-wins claim: the WHERE courier_id IS NULL guard is the lock. */
  async accept(deliveryId: string, userId: string): Promise<Delivery> {
    const profile = await this.getMyProfile(userId)
    if (profile.validationStatus !== ValidationStatus.VALIDATED || !profile.isAvailable) {
      throw new ForbiddenException('Passez disponible pour accepter une course')
    }

    const claimed = await this.em.getConnection().execute(
      `UPDATE deliveries SET courier_id = ?, status = 'ACCEPTED', accepted_at = NOW(), "updatedAt" = NOW()
       WHERE id = ? AND courier_id IS NULL AND status = 'AWAITING_COURIER'
       RETURNING id`,
      [profile.id, deliveryId],
    )

    if (claimed.length === 0) {
      const delivery = await this.em.findOne(Delivery, { id: deliveryId })
      if (!delivery) {
        throw new NotFoundException('Delivery not found')
      }
      if (delivery.status === DeliveryStatus.CANCELLED) {
        throw new GoneException('Cette commande a été annulée')
      }
      throw new ConflictException('Cette course a déjà été prise par un autre livreur')
    }

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

  async pickup(deliveryId: string, userId: string, occurredAt?: string): Promise<Delivery> {
    const delivery = await this.loadOwnedDelivery(deliveryId, userId)
    this.assertStatus(delivery, DeliveryStatus.ACCEPTED)

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

  async start(deliveryId: string, userId: string, occurredAt?: string): Promise<Delivery> {
    const delivery = await this.loadOwnedDelivery(deliveryId, userId)
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
    this.assertStatus(delivery, DeliveryStatus.IN_TRANSIT)

    if (data.proofType === 'CODE') {
      if (delivery.confirmationCode !== data.code) {
        throw new UnprocessableEntityException('Code de confirmation invalide')
      }
      delivery.proofType = DeliveryProofType.CODE
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
      const amount = isCash ? deliveryFee - courierFee : courierFee
      if (!(amount > 0)) {
        return
      }

      const wallet = await this.walletService.getOrCreate({ courierId: courier.id })
      if (isCash) {
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

      const formatted = amount.toLocaleString('fr-FR')
      const courierUser = await this.em.findOneOrFail(User, { id: courier.user.id })
      await this.notificationsService.send({
        user: courierUser,
        type: NotificationType.COURIER_EARNING,
        title: 'Course réglée',
        body: isCash
          ? `Commission de ${formatted} FCFA prélevée sur votre portefeuille`
          : `+${formatted} FCFA crédités sur votre portefeuille`,
        data: { deliveryId: delivery.id, orderId: order.id, amount: isCash ? -amount : amount },
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
    await this.em.flush()
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
