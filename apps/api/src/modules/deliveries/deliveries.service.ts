import type { PageWindow } from '../../common/page-window'
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
import { computeWindowDispatchAt } from '../../common/delivery-window'
import { User, UserRole } from '../auth/auth.entity'
import { clearLowBalanceAlert, refundTargetWallet } from '../family-wallet/family-payment.service'
import { GiftFailureService } from '../gift/gift-failure.service'
import { GiftNotifierService } from '../gift/gift-notifier.service'
import { GIFT_PROOF_FAR_METRES, giftBadRequest } from '../gift/gift-texts'
import { isLinkedRecipient } from '../gift/recipient-link'
import { Media, MediaContext } from '../media/media.entity'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { Order, OrderStatus, PaymentMethod, PickupMode } from '../orders/entities/order.entity'
import { OrdersService } from '../orders/orders.service'
import { Checkout } from '../payments/entities/checkout.entity'
import { DeliveryPricingService } from '../settings/delivery-pricing.service'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { ValidationStatus } from '../suppliers/supplier.entity'
import { WalletTransactionType } from '../wallet/entities/wallet-transaction.entity'
import { PlatformAccount } from '../wallet/entities/wallet.entity'
import { WalletService } from '../wallet/wallet.service'
import { DispatchService } from './dispatch.service'
import { CourierProfile, VehicleType } from './entities/courier-profile.entity'
import { DeliveryEvent, DeliveryEventType } from './entities/delivery-event.entity'
import { DeliveryOfferResponse } from './entities/delivery-offer.entity'
import { DeliveryRun, DeliveryRunOutcome, DeliveryRunStatus } from './entities/delivery-run.entity'
import { Delivery, DeliveryFailReason, DeliveryProofType, DeliveryPurpose, DeliveryStatus, DispatchPhase } from './entities/delivery.entity'

/** What the terroir module learns of a shop's order handed over at the eBio hub. */
export interface ExportCollectionReceived {
  deliveryId: string
  orderId: string
  supplierId: string
  shipmentId: string
  /** Courier (hub code) or back-office user (« Reçu »). */
  actorUserId: string | null
  source: ExportReceptionSource
}

/** A shop's terroir order picked up by the courier, on its way to the hub. */
export interface ExportCollectionPickedUp {
  deliveryId: string
  orderId: string
  shopName: string
  shipmentId: string
}

/** How the hub took delivery of a collection run. */
export type ExportReceptionSource = 'HUB_CODE' | 'ADMIN_RECEIVED' | 'ADMIN_COLLECTED'

/** What a delivery response needs, down to the products the courier carries. */
const DELIVERY_POPULATE = [
  'order',
  'order.buyer',
  'order.supplier',
  // The shop owner's phone: the courier calls when the parcel is late or missing.
  'order.supplier.user',
  // A cart sent to a relative: the courier calls and hands over to them.
  'order.checkout',
  'order.items',
  'order.items.product',
  'order.items.variant',
  'courier',
] as const

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
  private readonly exportReceivedListeners: Array<(event: ExportCollectionReceived) => Promise<void>> = []
  private readonly exportPickedUpListeners: Array<(event: ExportCollectionPickedUp) => Promise<void>> = []

  constructor(
    private readonly em: EntityManager,
    private readonly notificationsService: NotificationsService,
    private readonly dispatchService: DispatchService,
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
    private readonly walletService: WalletService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly deliveryPricing: DeliveryPricingService,
    @Inject(forwardRef(() => GiftNotifierService))
    private readonly giftNotifier: GiftNotifierService,
    @Inject(forwardRef(() => GiftFailureService))
    private readonly giftFailure: GiftFailureService,
  ) {}

  // ===== Delivery to a relative =====

  /** The checkout behind an order when the cart goes to a relative, or null. */
  private async giftCheckoutOf(order: Order): Promise<Checkout | null> {
    return order.checkout ? this.giftCheckoutById(order.checkout.id) : null
  }

  private async giftCheckoutById(checkoutId: string): Promise<Checkout | null> {
    const checkout = await this.em.findOne(Checkout, { id: checkoutId })
    return checkout?.recipientPhone ? checkout : null
  }

  /**
   * The photo goes to a payer abroad as proof: it must be one this courier
   * took for a hand-over, not any media id they could lay hands on.
   */
  private async assertProofMedia(mediaId: string, userId: string): Promise<void> {
    const media = await this.em.findOne(Media, { id: mediaId })
    if (!media || media.context !== MediaContext.DELIVERY_PROOF || media.uploadedBy?.id !== userId) {
      throw giftBadRequest('INVALID_PROOF_MEDIA', 'Photo de remise introuvable : reprenez la photo et réessayez.')
    }
  }

  /** Metres from the proof position to the drop-off point, or null without one. */
  private async proofDistance(order: Order, latitude: number, longitude: number): Promise<number | null> {
    if (order.deliveryLatitude == null || order.deliveryLongitude == null) {
      return null
    }
    const rows = await this.em.getConnection().execute(
      `SELECT ST_Distance(
         ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography,
         ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography
       ) AS metres`,
      [longitude, latitude, order.deliveryLongitude, order.deliveryLatitude],
    ) as Array<{ metres: number | string }>
    return rows[0] ? Math.round(Number(rows[0].metres)) : null
  }

  /**
   * The code-and-photo proof, checked and measured. The code is checked by
   * the caller, against the delivery's or the run's own.
   */
  private async giftProofFields(
    data: Extract<CompleteDelivery, { proofType: 'CODE_AND_PHOTO' }>,
    userId: string,
    order: Order,
    fallbackTakenAt: Date,
  ): Promise<Pick<Delivery, 'proofMediaId' | 'proofLatitude' | 'proofLongitude' | 'proofTakenAt' | 'proofDistanceM' | 'proofFar'>> {
    await this.assertProofMedia(data.mediaId, userId)
    const distance = await this.proofDistance(order, data.latitude, data.longitude)
    const takenAt = data.occurredAt ? new Date(data.occurredAt) : fallbackTakenAt
    return {
      proofMediaId: data.mediaId,
      proofLatitude: data.latitude,
      proofLongitude: data.longitude,
      // Never in the future: a phone clock ahead must not date the proof after the event.
      proofTakenAt: takenAt.getTime() > Date.now() ? new Date() : takenAt,
      proofDistanceM: distance,
      proofFar: distance !== null && distance > GIFT_PROOF_FAR_METRES,
    }
  }

  /** A gift hand-over takes the code and the photo together, nothing less. */
  private assertGiftProof(data: CompleteDelivery): asserts data is Extract<CompleteDelivery, { proofType: 'CODE_AND_PHOTO' }> {
    if (data.proofType !== 'CODE_AND_PHOTO') {
      throw giftBadRequest(
        'GIFT_PROOF_REQUIRED',
        'Livraison pour un proche : saisissez le code et prenez la photo de la remise.',
      )
    }
  }

  // ===== Courier profile =====

  async registerCourier(userId: string, data: RegisterCourier): Promise<CourierProfile> {
    const existing = await this.em.findOne(CourierProfile, { user: { id: userId } })
    if (existing) {
      throw new ConflictException('Une demande de livreur existe déjà pour ce compte')
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
      throw new NotFoundException('Aucun profil livreur pour ce compte')
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
      throw new ForbiddenException('Seuls les livreurs validés peuvent se mettre en ligne')
    }
    profile.isAvailable = isAvailable
    await this.em.flush()
    return profile
  }

  async updateLocation(userId: string, latitude: number, longitude: number): Promise<void> {
    const profile = await this.getMyProfile(userId)
    if (profile.validationStatus !== ValidationStatus.VALIDATED) {
      throw new ForbiddenException('Seuls les livreurs validés peuvent partager leur position')
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
   * addresses, the fee split (the platform rate may change later, the run
   * is paid at the rate in force when it was offered), and copies the
   * supplier position (may be null, the broadcast then targets everyone and
   * the supplier is nudged to set a location).
   */
  /**
   * Opens the run of a delivered checkout.
   *
   * It is born empty: deliveries join it as they are created, order by order,
   * when each shop accepts. The dispatch only happens once every pickup is
   * known.
   *
   * Pay follows the existing rule, `computeCourierFee` on the fee, applied
   * to the run's single fee. The courier gets their share of the road they
   * actually ride, not a share per order carried, which would pay them three
   * times for one trip.
   */
  /**
   * A cart opens as many runs as its split holds. Uniqueness is therefore no
   * longer the cart's but the shop batch's: replaying the creation must not
   * open the same run twice.
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

  /**
   * The parcel is ready. The search starts now, unless the buyer's window is
   * still far: then the run waits, SCHEDULED, until the window nears. A courier
   * found at 9 h for a 14 h delivery had nothing to do but lose the run.
   */
  async createForOrder(order: Order): Promise<Delivery | null> {
    const now = new Date()
    const windowDispatchAt = computeWindowDispatchAt(order.deliveryWindowStart)
    const waitsForWindow = windowDispatchAt !== null && windowDispatchAt.getTime() > now.getTime()
    const existing = await this.em.findOne(Delivery, { order: { id: order.id } })
    if (existing) {
      if (existing.status === DeliveryStatus.AWAITING_COURIER && existing.dispatchPhase === DispatchPhase.SCHEDULED) {
        existing.pickupReadyAt = now
        existing.dispatchAt = waitsForWindow ? windowDispatchAt : now
        await this.em.flush()
        if (!waitsForWindow) {
          await this.dispatchService.startDispatch(existing.id)
        }
      }
      return existing
    }
    return this.createDelivery(order, waitsForWindow ? { readyAt: now, dispatchAt: windowDispatchAt } : null)
  }

  /**
   * PREPARING with a readiness estimate: the run exists at once (visible to
   * the back-office, assignable by hand) but stays SCHEDULED until
   * DISPATCH_LEAD_MINUTES before the estimate, or until the buyer's window
   * nears, whichever is later.
   */
  async scheduleForOrder(order: Order): Promise<Delivery | null> {
    const existing = await this.em.findOne(Delivery, { order: { id: order.id } })
    if (existing) {
      return existing
    }
    const readyAt = order.estimatedReadyAt ?? new Date()
    return this.createDelivery(order, { readyAt, dispatchAt: this.computeDispatchAt(order, readyAt) })
  }

  /**
   * The back office moved the buyer's window. An unclaimed run follows it: back
   * to waiting if the window moved away, searched now if it came closer. A
   * claimed run keeps its courier, the pickup clock reads the window live,
   * but the reminder may fire again.
   */
  async applyWindowChange(order: Order, actorUserId: string): Promise<Delivery | null> {
    const delivery = await this.em.findOne(Delivery, { order: { id: order.id } }, { populate: ['deliveryRun', 'courier', 'courier.user'] })
    if (!delivery) {
      return null
    }
    delivery.pickupWarnedAt = null
    this.em.create(DeliveryEvent, {
      delivery,
      type: DeliveryEventType.WINDOW_CHANGED,
      actorUserId,
      payload: {
        windowStart: order.deliveryWindowStart?.toISOString() ?? null,
        windowEnd: order.deliveryWindowEnd?.toISOString() ?? null,
        slot: order.deliverySlot ?? null,
      },
    })
    if (delivery.courier) {
      await this.notificationsService.send({
        user: delivery.courier.user,
        type: NotificationType.DELIVERY_WINDOW_CHANGED,
        title: 'Créneau de livraison modifié',
        body: `Commande ${order.orderNumber} : livraison ${order.deliverySlot ?? 'dès que possible'}`,
        data: { deliveryId: delivery.id },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      })
    }
    // A run already searched as a whole is not taken apart for one shop.
    const isLockedInRun = Boolean(delivery.deliveryRun?.dispatchStartedAt)
    if (delivery.status !== DeliveryStatus.AWAITING_COURIER || isLockedInRun) {
      await this.em.flush()
      return delivery
    }

    const now = Date.now()
    const isReady = order.status === OrderStatus.READY
    const readyAt = isReady ? (delivery.pickupReadyAt ?? delivery.createdAt) : (delivery.pickupReadyAt ?? order.estimatedReadyAt ?? new Date())
    const dispatchAt = this.computeDispatchAt(order, readyAt)
    if (dispatchAt.getTime() > now) {
      if (delivery.dispatchPhase !== DispatchPhase.SCHEDULED) {
        await this.dispatchService.cancelPendingOffer(delivery.id)
        delivery.offeredToCourier = null
        delivery.offerExpiresAt = null
        delivery.dispatchPhase = DispatchPhase.SCHEDULED
      }
      delivery.pickupReadyAt = readyAt
      delivery.dispatchAt = dispatchAt
      await this.em.flush()
      return delivery
    }

    delivery.dispatchAt = new Date(now)
    await this.em.flush()
    if (delivery.dispatchPhase === DispatchPhase.SCHEDULED && isReady) {
      await this.dispatchService.startDispatch(delivery.id)
    }
    return delivery
  }

  /** The search opens before the parcel is ready, and no earlier than the window allows. */
  private computeDispatchAt(order: Order, readyAt: Date): Date {
    const windowDispatchAt = computeWindowDispatchAt(order.deliveryWindowStart)
    return new Date(Math.max(
      Date.now(),
      readyAt.getTime() - DISPATCH_LEAD_MINUTES * 60_000,
      windowDispatchAt?.getTime() ?? 0,
    ))
  }

  private async createDelivery(order: Order, schedule: { readyAt: Date, dispatchAt: Date } | null): Promise<Delivery | null> {
    const supplier = order.supplier
    // A sponsored (free-delivery promotion) run is still paid to the courier
    // in full: the snapshot is the real fee, whoever covers it.
    const deliveryFee = (order.deliveryFee || order.sponsoredDeliveryFee) ?? 0
    const rate = await this.platformSettings.getDeliveryCommissionRate()
    // The delivery joins the run that collects from its shop, a cart may hold
    // several, and picking the wrong one would send the courier to the wrong
    // address.
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
    await this.snapshotShopPosition(delivery, order)

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
   * Copies the supplier's PostGIS point onto the run, raw SQL like every geo
   * access. The plain lat/lng snapshot feeds the tracking map without
   * PostGIS. A shop without a position is nudged to set one.
   */
  private async snapshotShopPosition(delivery: Delivery, order: Order): Promise<void> {
    const supplier = order.supplier
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
  }

  // ===== Terroir collection to the eBio hub (011) =====

  /**
   * The terroir module hears of every order handed over at the hub, to run
   * its collection (order DELIVERED, shop paid, parcel advanced). A listener
   * rather than a dependency: the terroir module already depends on this one.
   */
  onExportCollectionReceived(listener: (event: ExportCollectionReceived) => Promise<void>): void {
    this.exportReceivedListeners.push(listener)
  }

  /** Told when the courier leaves the shop, for the buyer's « en route vers eBio ». */
  onExportCollectionPickedUp(listener: (event: ExportCollectionPickedUp) => Promise<void>): void {
    this.exportPickedUpListeners.push(listener)
  }

  /**
   * A shop's terroir order is READY and eBio sends couriers (COURIER mode): a
   * run from the shop to the eBio hub, broadcast like any lone delivery.
   *
   * Priced with the platform quote, shop → hub, and paid by eBio from its
   * EXPORT account: the buyer paid the kilo price, which covers it, the shop
   * pays nothing, nothing is collected in cash. The courier keeps the usual
   * share of that fee (`computeCourierFee`), so a collection pays like any
   * course of the same length; eBio's own share is not posted, it would be
   * eBio charging itself a commission.
   *
   * Null, the eBio staff collecting instead, in EBIO mode, without a parcel,
   * or when the shop is out of the delivery range.
   */
  async createExportCollection(order: Order): Promise<Delivery | null> {
    if (order.pickupMode !== PickupMode.EXPORT || !order.checkout) {
      return null
    }
    const existing = await this.em.findOne(Delivery, { order: { id: order.id } })
    if (existing) {
      return existing
    }
    const setup = await this.platformSettings.getExportCollectionSetup()
    if (setup.mode !== 'COURIER') {
      return null
    }
    const hub = setup.hub
    const [shipment] = await this.em.getConnection().execute(
      `SELECT id FROM export_shipments WHERE checkout_id = ?`,
      [order.checkout.id],
    ) as Array<{ id: string }>
    if (!shipment) {
      this.logger.warn(`Export order ${order.id} has no parcel: no courier collection`)
      return null
    }
    const supplier = order.supplier
    const quote = await this.deliveryPricing.quote({
      supplierId: supplier.id,
      itemsTotal: 0,
      isDelivery: true,
      latitude: hub.latitude,
      longitude: hub.longitude,
    })
    if (quote.fee === null) {
      this.logger.warn(`Export collection of order ${order.id} cannot be priced (${quote.reason}): eBio collects it`)
      return null
    }
    const rate = await this.platformSettings.getDeliveryCommissionRate()
    const dropoff = hub.address === hub.name ? hub.address : `${hub.name}, ${hub.address}`
    const delivery = this.em.create(Delivery, {
      order,
      purpose: DeliveryPurpose.EXPORT_COLLECTION,
      exportShipmentId: shipment.id,
      exportHub: { name: hub.name, address: hub.address, phone: hub.phone, hours: hub.hours },
      pickupAddress: supplier.address ?? supplier.shopName,
      dropoffAddress: dropoff.slice(0, 255),
      dropoffLatitude: hub.latitude,
      dropoffLongitude: hub.longitude,
      offeredAt: new Date(),
      deliveryFee: quote.fee,
      courierFee: computeCourierFee(quote.fee, rate),
      // The hub's code: the staff give it once the parcel is in their hands.
      confirmationCode: String(randomInt(0, 1_000_000)).padStart(6, '0'),
      dispatchPhase: DispatchPhase.BROADCAST,
      pickupReadyAt: new Date(),
    })
    this.em.create(DeliveryEvent, {
      delivery,
      type: DeliveryEventType.CREATED,
      payload: { orderNumber: order.orderNumber, purpose: DeliveryPurpose.EXPORT_COLLECTION, exportShipmentId: shipment.id, distanceKm: quote.distanceKm },
    })
    await this.em.flush()
    await this.snapshotShopPosition(delivery, order)
    try {
      await this.dispatchService.startDispatch(delivery.id)
    }
    catch (error) {
      this.logger.error(`Initial broadcast failed for export collection ${delivery.id}`, error instanceof Error ? error.stack : String(error))
    }
    return delivery
  }

  /**
   * « Reçu au point de regroupement »: the hub staff confirm from the back
   * office instead of giving the courier the code. Same effect as the code,
   * and a no-op once the order was received either way.
   */
  async receiveExportCollection(deliveryId: string, actorUserId: string): Promise<Delivery> {
    const delivery = await this.em.findOne(Delivery, { id: deliveryId }, {
      populate: [...DELIVERY_POPULATE, 'courier.user'],
      refresh: true,
    })
    if (!delivery || delivery.purpose !== DeliveryPurpose.EXPORT_COLLECTION) {
      throw new NotFoundException({ statusCode: 404, code: 'EXPORT_COLLECTION_NOT_FOUND', message: 'Collecte introuvable.' })
    }
    if (delivery.status === DeliveryStatus.DELIVERED) {
      return delivery
    }
    if (!delivery.courier || !ACTIVE_STATUSES.includes(delivery.status)) {
      throw new ConflictException({
        statusCode: 409,
        code: 'EXPORT_COLLECTION_NO_COURIER',
        message: 'Aucun livreur n’apporte cette commande : si elle est au point de regroupement, utilisez « Collecté ».',
      })
    }
    await this.completeExportCollection(delivery, actorUserId, 'ADMIN_RECEIVED', new Date(), true)
    return delivery
  }

  /**
   * The order was collected through the back office (« Collecté ») while a
   * collection run existed. A courier carrying it is closed and paid, he
   * made the trip; a run nobody picked up yet is withdrawn, unpaid.
   */
  async closeExportCollection(order: Order): Promise<void> {
    const delivery = await this.em.findOne(Delivery, { order: { id: order.id }, purpose: DeliveryPurpose.EXPORT_COLLECTION }, {
      populate: ['order', 'courier', 'courier.user'],
    })
    if (!delivery) {
      return
    }
    if (delivery.status === DeliveryStatus.PICKED_UP || delivery.status === DeliveryStatus.IN_TRANSIT) {
      await this.completeExportCollection(delivery, null, 'ADMIN_COLLECTED', new Date(), false)
      return
    }
    if (delivery.status !== DeliveryStatus.AWAITING_COURIER && delivery.status !== DeliveryStatus.ACCEPTED) {
      return
    }
    const assignedCourier = delivery.courier
    await this.dispatchService.cancelPendingOffer(delivery.id)
    delivery.status = DeliveryStatus.CANCELLED
    this.em.create(DeliveryEvent, {
      delivery,
      type: DeliveryEventType.SELF_DELIVERED,
      payload: { source: 'EBIO_COLLECTED' },
    })
    await this.em.flush()
    if (assignedCourier) {
      await this.notificationsService.send({
        user: assignedCourier.user,
        type: NotificationType.ORDER_CANCELLED,
        title: 'Course retirée',
        body: `eBio a déjà récupéré la commande ${order.orderNumber} : la course est retirée de votre liste.`,
        data: { deliveryId: delivery.id },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      })
    }
  }

  /**
   * The hub took the parcel. The atomic status guard makes the first of the
   * hub code, « Reçu » and « Collecté » win: the others find it delivered
   * and change nothing, so neither the courier nor the shop is paid twice.
   * `notify`: run the terroir collection; false when it is the caller.
   */
  private async completeExportCollection(delivery: Delivery, actorUserId: string | null, source: ExportReceptionSource, when: Date, notify: boolean): Promise<boolean> {
    const proofType = source === 'HUB_CODE' ? DeliveryProofType.CODE : null
    const claimed = await this.em.getConnection().execute(
      `UPDATE deliveries SET status = 'DELIVERED', delivered_at = ?, proof_type = ?, "updatedAt" = NOW()
       WHERE id = ? AND status IN ('ACCEPTED', 'PICKED_UP', 'IN_TRANSIT')
       RETURNING id`,
      [when, proofType, delivery.id],
    )
    if (claimed.length === 0) {
      return false
    }
    // Same values as the row: keeps the entity in step with the raw update.
    delivery.status = DeliveryStatus.DELIVERED
    delivery.deliveredAt = when
    delivery.proofType = proofType ?? undefined
    this.em.create(DeliveryEvent, {
      delivery,
      type: DeliveryEventType.DELIVERED,
      actorUserId: actorUserId ?? undefined,
      occurredAt: when,
      payload: { purpose: DeliveryPurpose.EXPORT_COLLECTION, source, proofType },
    })
    await this.em.flush()

    await this.settleExportCollection(delivery)

    if (!notify || !delivery.exportShipmentId) {
      return true
    }
    const event: ExportCollectionReceived = {
      deliveryId: delivery.id,
      orderId: delivery.order.id,
      supplierId: delivery.order.supplier.id,
      shipmentId: delivery.exportShipmentId,
      actorUserId,
      source,
    }
    for (const listener of this.exportReceivedListeners) {
      try {
        await listener(event)
      }
      catch (error) {
        this.logger.error(`Terroir collection not run after hub reception of ${delivery.id}`, error instanceof Error ? error.stack : String(error))
      }
    }
    return true
  }

  /**
   * Pays the courier of a collection run: the usual earning, credited, and
   * the same amount debited from eBio's EXPORT account, the logistics cost
   * the kilo price covers. Idempotent on the earning; never throws.
   */
  private async settleExportCollection(delivery: Delivery): Promise<void> {
    const courier = delivery.courier
    if (!courier) {
      return
    }
    try {
      const already = await this.em.getConnection().execute(
        `SELECT 1 FROM wallet_transactions WHERE delivery_id = ? AND type = 'DELIVERY_EARNING' LIMIT 1`,
        [delivery.id],
      )
      const amount = Math.round(delivery.courierFee ?? 0)
      if (already.length > 0 || !(amount > 0)) {
        return
      }
      const orderNumber = delivery.order.orderNumber
      const wallet = await this.walletService.getOrCreate({ courierId: courier.id })
      await this.walletService.credit(wallet.id, {
        type: WalletTransactionType.DELIVERY_EARNING,
        amount,
        description: `Gain de la course, commande #${orderNumber} apportée au point eBio`,
        orderId: delivery.order.id,
        deliveryId: delivery.id,
      })
      await this.walletService.post(PlatformAccount.EXPORT, 'debit', {
        type: WalletTransactionType.EXPORT_COLLECTION_COST,
        amount,
        description: `Collecte vers le point eBio, commande #${orderNumber}`,
        orderId: delivery.order.id,
        deliveryId: delivery.id,
      })
      const courierUser = await this.em.findOneOrFail(User, { id: courier.user.id })
      await this.notificationsService.send({
        user: courierUser,
        type: NotificationType.COURIER_EARNING,
        title: 'Course réglée',
        body: `+${amount.toLocaleString('fr-FR')} FCFA crédités sur votre portefeuille`,
        data: { deliveryId: delivery.id, orderId: delivery.order.id, amount },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      })
    }
    catch (error) {
      this.logger.error(`Export collection settlement failed for delivery ${delivery.id}`, error instanceof Error ? error.stack : String(error))
    }
  }

  /**
   * A collection run the courier declared failed goes back on offer at once:
   * the order is still READY at the shop's (it never left that status), and
   * the parcel still has to reach the hub. The failed courier is not paid.
   */
  private async reofferExportCollection(delivery: Delivery): Promise<void> {
    const released = delivery.courier
    delivery.courier = null
    delivery.status = DeliveryStatus.AWAITING_COURIER
    delivery.acceptedAt = undefined
    delivery.pickedUpAt = undefined
    delivery.inTransitAt = undefined
    delivery.pickupWarnedAt = null
    delivery.offeredToCourier = null
    delivery.offerExpiresAt = null
    delivery.dispatchPhase = DispatchPhase.BROADCAST
    delivery.reassignmentCount += 1
    delivery.offeredAt = new Date()
    this.em.create(DeliveryEvent, {
      delivery,
      type: DeliveryEventType.REASSIGNED,
      payload: { releasedCourierId: released?.id ?? null, reason: 'FAILED' },
    })
    await this.em.flush()
    try {
      await this.dispatchService.startDispatch(delivery.id)
    }
    catch (error) {
      this.logger.error(`Re-offer failed for export collection ${delivery.id}`, error instanceof Error ? error.stack : String(error))
    }
  }

  private async announceExportPickup(delivery: Delivery): Promise<void> {
    if (!delivery.exportShipmentId) {
      return
    }
    const event: ExportCollectionPickedUp = {
      deliveryId: delivery.id,
      orderId: delivery.order.id,
      shopName: delivery.order.supplier.shopName,
      shipmentId: delivery.exportShipmentId,
    }
    for (const listener of this.exportPickedUpListeners) {
      try {
        await listener(event)
      }
      catch (error) {
        this.logger.error(`Terroir not told of the pickup of ${delivery.id}`, error instanceof Error ? error.stack : String(error))
      }
    }
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
      throw new ForbiddenException({ statusCode: 403, code: 'COURIER_UNAVAILABLE', message: 'Passez disponible pour voir les courses proposées' })
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
       SELECT d.id, d.purpose, d.export_hub, o.order_number, d.pickup_address, d.dropoff_address, d.offered_at,
              s.shop_name, o.total_amount, o.payment_method, d.delivery_fee, d.courier_fee,
              o.delivery_fee AS buyer_delivery_fee,
              (d.offered_to_courier_id = ?) AS is_targeted,
              CASE WHEN d.offered_to_courier_id = ? THEN d.offer_expires_at END AS offer_expires_at,
              -- A collection ends at the eBio hub, not at the buyer's (011).
              COALESCE(d.dropoff_latitude, o.delivery_latitude) AS dropoff_latitude,
              COALESCE(d.dropoff_longitude, o.delivery_longitude) AS dropoff_longitude,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS items_count,
              -- What the courier will carry: they decide on the load too, not
              -- only on the fee (does it fit the bike, is it fragile).
              (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                        'name', p.name,
                        'variantLabel', v.label,
                        'quantity', oi.quantity,
                        'isGift', oi.is_gift,
                        'photo', p.photos->>0
                      ) ORDER BY oi.is_gift, p.name), '[]'::jsonb)
               FROM order_items oi
               JOIN products p ON p.id = oi.product_id
               LEFT JOIN product_variants v ON v.id = oi.variant_id
               WHERE oi.order_id = o.id) AS items,
              CASE WHEN d.pickup_location IS NOT NULL AND me.loc IS NOT NULL
                THEN ROUND((ST_Distance(d.pickup_location, me.loc) / 1000)::numeric, 2)
              END AS distance_km,
              CASE WHEN d.pickup_location IS NOT NULL AND COALESCE(d.dropoff_latitude, o.delivery_latitude) IS NOT NULL
                THEN ROUND((ST_Distance(d.pickup_location,
                  ST_SetSRID(ST_MakePoint(COALESCE(d.dropoff_longitude, o.delivery_longitude), COALESCE(d.dropoff_latitude, o.delivery_latitude)), 4326)::geography) / 1000)::numeric, 2)
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
      throw new ForbiddenException({ statusCode: 403, code: 'COURIER_UNAVAILABLE', message: 'Passez disponible pour accepter une course' })
    }
    await this.assertNotBlocked(profile.id)

    const attached = await this.em.findOne(Delivery, { id: deliveryId }, { populate: ['deliveryRun'] })
    if (attached?.deliveryRun) {
      throw new ConflictException('Cette course fait partie d\'une tournée : acceptez la tournée entière')
    }

    // Targeted phase: only the courier holding the open offer may claim.
    const claimed = await this.em.getConnection().execute(
      `UPDATE deliveries
       SET courier_id = ?, status = 'ACCEPTED', accepted_at = NOW(), pickup_warned_at = NULL,
           offered_to_courier_id = NULL, offer_expires_at = NULL, "updatedAt" = NOW()
       WHERE id = ? AND courier_id IS NULL AND status = 'AWAITING_COURIER'
         AND (dispatch_phase = 'BROADCAST' OR (offered_to_courier_id = ? AND offer_expires_at > NOW()))
       RETURNING id`,
      [profile.id, deliveryId, profile.id],
    )

    if (claimed.length === 0) {
      const delivery = await this.em.findOne(Delivery, { id: deliveryId })
      if (!delivery) {
        throw new NotFoundException('Livraison introuvable')
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
    // The claim was a raw UPDATE: without a refresh the courier got back the
    // delivery as it was before, no courier, still awaiting one.
    const delivery = await this.loadDelivery(deliveryId, { refresh: true })
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
      // A collection goes to the eBio hub: the buyer abroad follows the parcel instead.
      delivery.purpose === DeliveryPurpose.EXPORT_COLLECTION
        ? Promise.resolve()
        : this.notificationsService.send({
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
   * The runs offered to this courier: the ones they hold exclusively, and the
   * ones the broadcast pushed into their radius.
   *
   * Same reference point as for lone deliveries, a live position under 12 h,
   * the declared zone otherwise, and the same visibility rules.
   */
  async getRunOffers(userId: string): Promise<RunOfferRow[]> {
    const profile = await this.getMyProfile(userId)
    if (profile.validationStatus !== ValidationStatus.VALIDATED || !profile.isAvailable) {
      throw new ForbiddenException({ statusCode: 403, code: 'COURIER_UNAVAILABLE', message: 'Passez disponible pour voir les tournées proposées' })
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
              c.payment_method,
              (SELECT COALESCE(SUM(o.total_amount), 0) + r.delivery_fee
               FROM deliveries d
               JOIN orders o ON o.id = d.order_id
               WHERE d.delivery_run_id = r.id) AS total_amount,
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
         -- Jamais entrée dans la boucle de diffusion : ses boutiques n'ont pas
         -- toutes préparé, il n'y a encore rien à collecter. La proposer
         -- laisserait un livreur accepter une tournée vide.
         AND r.dispatch_started_at IS NOT NULL
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
   * Orders the pickups of a run from a starting point.
   *
   * Called twice: at opening, with no known courier, so the offer shows a
   * plausible order; then on acceptance, from the courier's real position,
   * that one is authoritative, and it is the one the courier follows.
   */
  private async applyPickupOrder(run: DeliveryRun, origin: { latitude: number, longitude: number } | null): Promise<void> {
    const deliveries = run.deliveries.isInitialized()
      ? run.deliveries.getItems()
      : await this.em.find(Delivery, { deliveryRun: { id: run.id } })
    if (deliveries.length === 0) {
      return
    }
    // The drop-off is the cart's: a run has only one, which is the whole
    // reason it exists.
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

  /** A courier's last known position, if it is still fresh. */
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
   * A courier claims a whole run. As for a lone delivery, the
   * `courier_id IS NULL` guard is the lock: first write wins.
   *
   * Acceptance covers the whole, that is FR-015, and it is what makes the
   * single fee tenable. Deliveries follow the run; they are not accepted one
   * by one.
   */
  async acceptRun(runId: string, userId: string): Promise<DeliveryRun> {
    const profile = await this.getMyProfile(userId)
    if (profile.validationStatus !== ValidationStatus.VALIDATED || !profile.isAvailable) {
      throw new ForbiddenException({ statusCode: 403, code: 'COURIER_UNAVAILABLE', message: 'Passez disponible pour accepter une tournée' })
    }
    await this.assertNotBlocked(profile.id)

    const claimed = await this.em.getConnection().execute(
      `UPDATE delivery_runs
       SET courier_id = ?, status = 'ACCEPTED', accepted_at = NOW(),
           offered_to_courier_id = NULL, offer_expires_at = NULL, outcome = 'ACCEPTED', "updatedAt" = NOW()
       WHERE id = ? AND courier_id IS NULL AND status = 'AWAITING_COURIER'
         AND dispatch_started_at IS NOT NULL
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

    // `refresh` is not a detail: the claim is written in raw SQL, so the
    // entity already loaded in the context still carries the previous state.
    // Without a re-read, the caller gets a run still "awaiting a courier" that
    // they have just accepted.
    const run = await this.em.findOne(DeliveryRun, { id: runId }, { populate: ['deliveries'], refresh: true })
    if (!run) {
      throw new NotFoundException('Tournée introuvable')
    }

    // The visiting order freezes now: this is the only moment we know where
    // the courier starts from.
    await this.applyPickupOrder(run, await this.courierPosition(profile.id))

    // Each delivery follows its run. The per-order status keeps its shape,
    // which is what leaves the supplier app untouched.
    const deliveries = run.deliveries.getItems()
    for (const delivery of deliveries) {
      delivery.courier = profile
      delivery.status = DeliveryStatus.ACCEPTED
      delivery.acceptedAt = new Date()
      delivery.pickupWarnedAt = null
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

  /** The targeted courier passes: the next ranked one is asked at once. */
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
      throw new NotFoundException('Livraison introuvable')
    }
    if (delivery.status !== DeliveryStatus.AWAITING_COURIER || delivery.offeredToCourier?.id !== profile.id) {
      throw new ConflictException('Cette course ne vous est plus proposée')
    }
    await this.dispatchService.respondToOffer(deliveryId, profile.id, DeliveryOfferResponse.DECLINED)
  }

  async pickup(deliveryId: string, userId: string, occurredAt?: string): Promise<Delivery> {
    const delivery = await this.loadOwnedDelivery(deliveryId, userId)
    // Parcel already marked collected: a resend or a double tap, nothing to do.
    if (delivery.status === DeliveryStatus.PICKED_UP) {
      return delivery
    }
    this.assertStatus(delivery, DeliveryStatus.ACCEPTED)
    if (delivery.order.status === OrderStatus.PREPARING || delivery.order.status === OrderStatus.ACCEPTED) {
      throw new ConflictException('La commande n\'est pas encore prête : la boutique doit d\'abord la marquer prête')
    }

    const when = await this.clampOccurredAt(delivery, occurredAt)
    const isCollection = delivery.purpose === DeliveryPurpose.EXPORT_COLLECTION
    delivery.status = DeliveryStatus.PICKED_UP
    delivery.pickedUpAt = when
    // A collection keeps the hub's code, drawn at creation.
    if (!isCollection) {
      delivery.confirmationCode = String(randomInt(0, 10000)).padStart(4, '0')
    }

    this.em.create(DeliveryEvent, {
      delivery,
      type: DeliveryEventType.PICKED_UP,
      actorUserId: userId,
      occurredAt: when,
    })
    await this.em.flush()

    // The order stays READY on the shop's side until the hub receives it;
    // the buyer reads « en route vers eBio » on the parcel, no code (011).
    if (isCollection) {
      await this.announceExportPickup(delivery)
      return delivery
    }

    await this.ordersService.applyStatusFromDelivery(delivery.order.id, OrderStatus.IN_DELIVERY)

    await this.notificationsService.send({
      user: delivery.order.buyer,
      type: NotificationType.DELIVERY_PICKED_UP,
      title: 'Commande en route',
      body: `Votre commande ${delivery.order.orderNumber} a été récupérée. Code de confirmation : ${delivery.confirmationCode}`,
      data: { deliveryId: delivery.id, orderId: delivery.order.id, confirmationCode: delivery.confirmationCode },
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    })

    // The relative is the one at the door: they get the code too. The payer
    // keeps their push, their fallback if the text never arrives.
    const gift = await this.giftCheckoutOf(delivery.order)
    if (gift) {
      await this.giftNotifier.sendCodeToRecipient(gift.id, delivery.confirmationCode ?? '')
    }

    return delivery
  }

  /**
   * Progress of a delivery's run, for the buyer.
   *
   * Without it, two orders of the same cart show two tracking lines that
   * contradict each other, and nothing tells the buyer the decision is theirs.
   */
  async runSummaryFor(delivery: Delivery): Promise<{ id: string, shopCount: number, collectedCount: number, awaitingBuyerDecision: boolean } | null> {
    const runId = delivery.deliveryRun?.id
    if (!runId) {
      return null
    }
    const rows = await this.em.getConnection().execute(
      `SELECT r.shop_count, r.status,
              COUNT(*) FILTER (WHERE d.status <> 'ACCEPTED' AND d.status <> 'AWAITING_COURIER') AS collected
       FROM delivery_runs r
       JOIN deliveries d ON d.delivery_run_id = r.id
       WHERE r.id = ?
       GROUP BY r.shop_count, r.status`,
      [runId],
    ) as Array<{ shop_count: number | string, status: string, collected: number | string }>
    if (rows.length === 0) {
      return null
    }
    return {
      id: runId,
      shopCount: Number(rows[0].shop_count),
      collectedCount: Number(rows[0].collected),
      awaitingBuyerDecision: rows[0].status === 'BUYER_DECISION',
    }
  }

  /**
   * The buyer decides when nobody takes their order any more: wait, or cancel
   * and be credited in full, delivery fee included.
   *
   * Cancelling stays open as long as nothing has been collected. Once a shop
   * has handed its goods to the courier it has incurred costs: the order runs
   * its course and the buyer will be delivered.
   */
  async buyerDecision(runId: string, userId: string, decision: 'WAIT' | 'CANCEL'): Promise<{ cancelledOrders: number }> {
    const run = await this.em.findOne(DeliveryRun, { id: runId }, { populate: ['checkout'] })
    if (!run) {
      throw new NotFoundException('Tournée introuvable')
    }
    if (run.checkout.buyer.id !== userId) {
      throw new ForbiddenException('Cette commande n\'est pas la vôtre')
    }

    if (decision === 'WAIT') {
      // The dispatch never stopped: nothing to restart, only a question not to
      // ask again right away.
      run.buyerPromptedAt = new Date()
      await this.em.flush()
      return { cancelledOrders: 0 }
    }

    const orders = await this.em.find(Order, { checkout: { id: run.checkout.id } }, { populate: ['supplier'] })
    let cancelled = 0
    for (const order of orders) {
      if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.DELIVERED) {
        continue
      }
      // Goods already collected: the delivery is committed, we do not undo it.
      const delivery = await this.em.findOne(Delivery, { order: { id: order.id } })
      if (delivery && delivery.status !== DeliveryStatus.AWAITING_COURIER && delivery.status !== DeliveryStatus.ACCEPTED) {
        continue
      }
      await this.ordersService.applyStatusFromDelivery(order.id, OrderStatus.CANCELLED)
      cancelled += 1

      const supplierUser = await this.resolveSupplierUser(order)
      if (supplierUser) {
        await this.notificationsService.send({
          user: supplierUser,
          type: NotificationType.ORDER_CANCELLED,
          title: 'Commande annulée',
          body: `La commande ${order.orderNumber} est annulée : aucun livreur n'a pu la prendre en charge.`,
          data: { orderId: order.id },
          channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
        })
      }
    }

    run.status = DeliveryRunStatus.CANCELLED
    run.outcome = DeliveryRunOutcome.CANCELLED
    await this.em.flush()

    // The delivery fee covered nothing: it comes back in full, on top of the
    // orders' refund.
    const fee = Math.round(run.deliveryFee)
    if (fee > 0 && cancelled > 0) {
      // Back where the cart was paid from: a family wallet, or its payer once closed.
      const target = await refundTargetWallet(this.em, this.walletService, run.checkout, userId)
      await this.walletService.credit(target.walletId, {
        type: WalletTransactionType.REFUND,
        amount: fee,
        description: 'Remboursement des frais de livraison, aucun livreur disponible',
        deliveryRunId: run.id,
        familyMemberId: target.familyMemberId,
      })
      if (target.familyWalletId) {
        await clearLowBalanceAlert(this.em, target.familyWalletId)
      }
      run.deliveryFee = 0
      await this.em.flush()
    }

    return { cancelledOrders: cancelled }
  }

  /**
   * Removes a shop from a cart's run, and says what the buyer should get back
   * on the fee.
   *
   * A run that loses a pickup costs less to ride: keeping the difference would
   * amount to charging for a trip that will not happen. The new fee is priced
   * by the same rules as the original quote, on the remaining shops.
   *
   * If the pickup already happened, nothing changes: the courier rode that
   * road and is paid for it (FR-021, the run goes on for the others).
   */
  async removeSupplierFromRun(input: { checkoutId: string, supplierId: string }): Promise<{ runId: string, refund: number, remainingShops: number } | null> {
    // Filtering in memory rather than in SQL: `supplier_ids` is jsonb, which
    // has no `LIKE` operator. A cart holds a handful of runs anyway.
    const runs = await this.em.find(
      DeliveryRun,
      { checkout: { id: input.checkoutId } },
      { populate: ['deliveries'] },
    )
    const run = runs.find(candidate => candidate.supplierIds.includes(input.supplierId))
    if (!run) {
      return null
    }

    const deliveries = run.deliveries.getItems()
    const leaving = deliveries.find(delivery => delivery.order.supplier.id === input.supplierId)
    const collected = leaving !== undefined && leaving.status !== DeliveryStatus.ACCEPTED
      && leaving.status !== DeliveryStatus.AWAITING_COURIER

    if (leaving) {
      leaving.deliveryRun = undefined
      if (!collected) {
        leaving.status = DeliveryStatus.CANCELLED
      }
    }
    const remaining = run.supplierIds.filter(id => id !== input.supplierId)
    run.supplierIds = remaining
    run.shopCount = remaining.length
    run.pickupOrder = run.pickupOrder.filter(id => id !== leaving?.id)

    // Nothing left to collect: the run has no purpose any more.
    if (remaining.length === 0) {
      run.status = DeliveryRunStatus.CANCELLED
      run.outcome = DeliveryRunOutcome.CANCELLED
      const refundAll = collected ? 0 : Math.round(run.deliveryFee)
      run.deliveryFee = collected ? run.deliveryFee : 0
      await this.em.flush()
      await this.dispatchService.cancelPendingRunOffer(run.id)
      return { runId: run.id, refund: refundAll, remainingShops: 0 }
    }

    // The courier already rode that road: we do not take it back from them,
    // and we refund nothing either, the kilometre was covered.
    if (collected) {
      await this.em.flush()
      return { runId: run.id, refund: 0, remainingShops: remaining.length }
    }

    const checkout = await this.em.findOne(Checkout, { id: input.checkoutId })
    const quote = await this.deliveryPricing.quoteRun({
      supplierIds: remaining,
      itemsTotal: checkout?.itemsTotal ?? 0,
      isDelivery: true,
      latitude: checkout?.deliveryLatitude,
      longitude: checkout?.deliveryLongitude,
    })
    const nextFee = Math.round(quote.fee ?? run.deliveryFee)
    const refund = Math.max(0, Math.round(run.deliveryFee) - nextFee)

    const rate = await this.platformSettings.getDeliveryCommissionRate()
    run.deliveryFee = nextFee
    run.courierEarning = computeCourierFee(nextFee, rate)
    run.totalDistanceKm = quote.distanceKm ?? undefined
    await this.em.flush()

    return { runId: run.id, refund, remainingShops: remaining.length }
  }

  /**
   * The courier's current run, with its pickups in visiting order.
   *
   * The courier needs a single screen: without it, their two pickups look like
   * two unrelated deliveries, and nothing tells them where to start nor that a
   * single handover waits at the end.
   */
  async getMyActiveRun(userId: string): Promise<ActiveRunRow | null> {
    const profile = await this.getMyProfile(userId)
    const rows = await this.em.getConnection().execute(
      `SELECT r.id, r.status, r.shop_count, r.courier_earning, r.delivery_fee,
              r.total_distance_km, r.confirmation_code, r.pickup_order,
              c.delivery_address AS dropoff_address,
              c.delivery_latitude AS dropoff_latitude, c.delivery_longitude AS dropoff_longitude,
              c.payment_method,
              (SELECT COALESCE(SUM(o.total_amount), 0) + r.delivery_fee
               FROM deliveries d
               JOIN orders o ON o.id = d.order_id
               WHERE d.delivery_run_id = r.id) AS total_amount,
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
         AND EXISTS (SELECT 1 FROM deliveries d WHERE d.delivery_run_id = r.id)
       ORDER BY r."updatedAt" DESC
       LIMIT 1`,
      [profile.id],
    ) as ActiveRunRow[]
    return rows[0] ?? null
  }

  /**
   * Pickup at one shop of a run.
   *
   * The status moves for **that** order only (FR-017): the shop sees its order
   * leave, the others keep waiting for the courier. That is what leaves the
   * supplier app unchanged, it does not know a run exists, and it does not
   * need to.
   *
   * The handover code, however, belongs to the run: drawn at the first pickup,
   * announced to the buyer once everything is loaded.
   */
  async collect(deliveryId: string, userId: string, occurredAt?: string): Promise<Delivery> {
    const delivery = await this.loadOwnedDelivery(deliveryId, userId)
    const run = delivery.deliveryRun
      ? await this.em.findOne(DeliveryRun, { id: delivery.deliveryRun.id }, { populate: ['deliveries'] })
      : null
    if (!run) {
      // Lone delivery: nothing new, this is the pickup from before runs.
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
    // The code is copied onto each delivery so the per-order screens, which
    // know nothing of runs, keep showing it.
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

    // Everything is loaded: the run is on the road, and the buyer gets their
    // code, once, not once per shop.
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

    // Once for the whole run, like the payer's push.
    const gift = await this.giftCheckoutById(run.checkout.id)
    if (gift) {
      await this.giftNotifier.sendCodeToRecipient(gift.id, run.confirmationCode)
    }

    return delivery
  }

  /**
   * Handover of a run: one code, every order delivered.
   *
   * The buyer holds a single parcel and should not recite one code per shop.
   * The courier is settled here, once, on the run's fee, the orders of a
   * unified cart carry zero, and a per-order settlement would pay them
   * nothing.
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
    if (run.status === DeliveryRunStatus.DELIVERED) {
      // Run already handed over: confirm it, code checked, rather than let
      // the courier believe shops are still waiting to be collected.
      if (data.proofType !== 'PHOTO' && (!run.confirmationCode || run.confirmationCode !== data.code)) {
        throw new UnprocessableEntityException('Code de confirmation invalide')
      }
      return run
    }
    if (run.status !== DeliveryRunStatus.DELIVERING) {
      throw new BadRequestException('Toutes les boutiques doivent être collectées avant la remise')
    }

    const cash = await this.isRunCash(run)
    const gift = await this.giftCheckoutById(run.checkout.id)
    if (gift) {
      this.assertGiftProof(data)
    }
    if (data.proofType === 'CODE' || data.proofType === 'CODE_AND_PHOTO') {
      if (!run.confirmationCode || run.confirmationCode !== data.code) {
        throw new UnprocessableEntityException('Code de confirmation invalide')
      }
    }
    else if (cash) {
      // The code is the buyer's receipt for the cash handed over: no photo.
      throw new UnprocessableEntityException('Une tournée payée en espèces se clôture avec le code de confirmation du client')
    }

    const when = new Date()
    // Measured once, against the run's drop-off: every order of a run goes
    // to the same door.
    const firstOrder = run.deliveries.getItems()[0]?.order
    const giftProof = data.proofType === 'CODE_AND_PHOTO' && firstOrder
      ? await this.giftProofFields(data, userId, await this.em.findOneOrFail(Order, { id: firstOrder.id }), when)
      : null
    // The proof covers the whole run: one handover, one proof. Each delivery
    // still carries it, because the per-order screens read it.
    const proofType = data.proofType === 'CODE'
      ? DeliveryProofType.CODE
      : data.proofType === 'CODE_AND_PHOTO' ? DeliveryProofType.CODE_AND_PHOTO : DeliveryProofType.PHOTO
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
      if (giftProof) {
        Object.assign(delivery, giftProof)
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

    // The courier's money first: a failure here is logged, never surfaced,
    // the goods are handed over whatever the ledger says.
    await this.settleRunWallet(run, cash)

    for (const delivery of run.deliveries.getItems()) {
      await this.ordersService.applyStatusFromDelivery(delivery.order.id, OrderStatus.DELIVERED)
    }

    // The payer hears it once for the run, with the photo.
    if (gift && firstOrder) {
      await this.giftNotifier.notifyDelivered({
        checkoutId: gift.id,
        orderId: firstOrder.id,
        mediaId: giftProof?.proofMediaId ?? null,
        deliveredAt: when,
      })
    }

    return run
  }

  /** A run is a cash one when its checkout is. */
  private async isRunCash(run: DeliveryRun): Promise<boolean> {
    const checkout = await this.em.findOne(Checkout, { id: run.checkout.id })
    return checkout?.paymentMethod === PaymentMethod.CASH_ON_DELIVERY
  }

  /**
   * Settles a run against the courier's wallet, once and for all.
   *
   * Paid online: the buyer paid the fee to the platform, the courier is
   * credited their share. Cash: they kept the whole fee at the door, so eBio's
   * cut is debited, the balance may go below zero, which is what top-ups are
   * for. Replayable: the entry carries the run.
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
      // A run leaves when the last shop is collected, not before: the decision
      // belongs to the run, not to one of its deliveries.
      throw new ConflictException('Cette course fait partie d\'une tournée : elle démarre quand toutes les boutiques sont collectées')
    }
    // Same reason as the handover: a resend must not look like an error when
    // the wanted state is already reached.
    if (delivery.status === DeliveryStatus.IN_TRANSIT) {
      return delivery
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
      // Closing a lone delivery would settle the courier on a zero fee, the
      // orders of a unified cart carry none, the fee sits on the run. The
      // handover happens as a whole, with a single code.
      throw new ConflictException('Cette course fait partie d\'une tournée : remettez la tournée entière')
    }
    // Already delivered: the courier tapped twice, or the offline queue is
    // replaying what the network swallowed, the answer was lost, not the
    // request. Confirming beats worrying someone who did their job. The code
    // is still checked: a completed handover does not excuse a wrong one.
    if (delivery.status === DeliveryStatus.DELIVERED) {
      if (data.proofType !== 'PHOTO' && delivery.confirmationCode !== data.code) {
        throw new UnprocessableEntityException('Code de confirmation invalide')
      }
      return delivery
    }
    if (delivery.purpose === DeliveryPurpose.EXPORT_COLLECTION) {
      return this.completeAtHub(delivery, userId, data)
    }
    this.assertStatus(delivery, DeliveryStatus.IN_TRANSIT)

    const gift = await this.giftCheckoutOf(delivery.order)
    if (gift) {
      this.assertGiftProof(data)
    }

    if (data.proofType === 'CODE_AND_PHOTO') {
      if (delivery.confirmationCode !== data.code) {
        throw new UnprocessableEntityException('Code de confirmation invalide')
      }
      const proof = await this.giftProofFields(
        data,
        userId,
        delivery.order,
        await this.clampOccurredAt(delivery, data.occurredAt),
      )
      delivery.proofType = DeliveryProofType.CODE_AND_PHOTO
      Object.assign(delivery, proof)
    }
    else if (data.proofType === 'CODE') {
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

    // The courier's money first: a failure here is logged, never surfaced,
    // the parcel is delivered whatever the ledger says.
    await this.settleCourierWallet(delivery)

    // ORDER_DELIVERED notification, cash commission and deliveredAt all come
    // from the existing order machinery.
    await this.ordersService.applyStatusFromDelivery(delivery.order.id, OrderStatus.DELIVERED)

    if (gift) {
      await this.giftNotifier.notifyDelivered({
        checkoutId: gift.id,
        orderId: delivery.order.id,
        mediaId: delivery.proofMediaId ?? null,
        deliveredAt: when,
      })
    }

    return delivery
  }

  /**
   * Hand-over at the eBio hub: the code the hub staff give once the parcel
   * is in their hands, nothing else (no photo, no buyer). The run may skip
   * « en route »: the hub is often around the corner.
   */
  private async completeAtHub(delivery: Delivery, userId: string, data: CompleteDelivery): Promise<Delivery> {
    if (delivery.status !== DeliveryStatus.PICKED_UP) {
      this.assertStatus(delivery, DeliveryStatus.IN_TRANSIT)
    }
    if (data.proofType !== 'CODE') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        code: 'EXPORT_HUB_CODE_REQUIRED',
        message: 'Collecte eBio : saisissez le code que vous donne le point de regroupement.',
      })
    }
    if (delivery.confirmationCode !== data.code) {
      throw new UnprocessableEntityException('Code du point de regroupement invalide')
    }
    const when = await this.clampOccurredAt(delivery, data.occurredAt)
    const done = await this.completeExportCollection(delivery, userId, 'HUB_CODE', when, true)
    // Received meanwhile through the back office: the answer is the same.
    return done ? delivery : this.loadDelivery(delivery.id, { refresh: true })
  }

  /**
   * Settles the delivery fee with the courier wallet once the run is done.
   * Paid online: the buyer's fee sits on the platform account, the courier
   * is credited their share. Cash: the courier pocketed the whole fee at the
   * door, so eBio's cut is debited (the balance may go negative, that is
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
          description: `Livraison offerte (promotion), commande #${order.orderNumber}`,
          orderId: order.id,
          deliveryId: delivery.id,
          allowNegative: true,
        })
      }
      if (isCash && !sponsored) {
        await this.walletService.debit(wallet.id, {
          type: WalletTransactionType.DELIVERY_COMMISSION,
          amount,
          description: `Commission eBio sur la course, commande #${order.orderNumber}`,
          orderId: order.id,
          deliveryId: delivery.id,
          allowNegative: true,
        })
      }
      else {
        await this.walletService.credit(wallet.id, {
          type: WalletTransactionType.DELIVERY_EARNING,
          amount,
          description: `Gain de la course, commande #${order.orderNumber}`,
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
          description: `Livraison offerte par eBio, commande #${order.orderNumber}`,
          orderId: order.id,
          deliveryId: delivery.id,
        })
      }
      else {
        await this.walletService.post(PlatformAccount.DELIVERY_COMMISSION, 'credit', {
          type: WalletTransactionType.PLATFORM_DELIVERY_SHARE,
          amount: deliveryFee - courierFee,
          description: `Part eBio sur la livraison, commande #${order.orderNumber}`,
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
      throw new BadRequestException('Cette livraison ne peut plus être déclarée en échec')
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

    const isCollection = delivery.purpose === DeliveryPurpose.EXPORT_COLLECTION
    const supplierUser = await this.resolveSupplierUser(delivery.order)
    if (supplierUser) {
      await this.notificationsService.send({
        user: supplierUser,
        type: NotificationType.DELIVERY_FAILED,
        title: isCollection ? 'Collecte eBio reportée' : 'Échec de livraison',
        body: isCollection
          ? `Le livreur n’a pas pu apporter la commande ${delivery.order.orderNumber} au point eBio : un autre livreur va passer.`
          : `La livraison de la commande ${delivery.order.orderNumber} a échoué (${this.failReasonLabel(data.reason)})`,
        data: { deliveryId: delivery.id, orderId: delivery.order.id, reason: data.reason },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      })
    }

    if (isCollection) {
      await this.reofferExportCollection(delivery)
      return delivery
    }

    // A cart for a relative cannot wait for the payer to sort things out from
    // abroad: the courier is paid for the trip, the order cancelled and the
    // rest refunded to the wallet (research §5). Ordinary orders move no money.
    if (await this.giftCheckoutOf(delivery.order)) {
      await this.settleFailedGiftCourier(delivery)
      await this.giftFailure.onGiftDeliveryFailed(delivery)
    }

    return delivery
  }

  /** The courier made the trip: settled as for a delivered run (never cash for a gift). */
  private async settleFailedGiftCourier(delivery: Delivery): Promise<void> {
    if (!delivery.deliveryRun) {
      await this.settleCourierWallet(delivery)
      return
    }
    const run = await this.em.findOne(DeliveryRun, { id: delivery.deliveryRun.id }, { populate: ['courier'] })
    if (run) {
      await this.settleRunWallet(run, false)
    }
  }

  /** A courier's deliveries, newest first; a window pages the history. */
  async getMine(userId: string, filter?: 'active' | 'done', window?: PageWindow | null): Promise<Delivery[]> {
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
      populate: [...DELIVERY_POPULATE],
      // The id breaks ties between rows updated in the same instant, so a
      // page boundary never repeats or skips one.
      orderBy: { updatedAt: 'DESC', id: 'DESC' },
      ...(window ?? {}),
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
      throw new NotFoundException('Aucune livraison pour cette commande')
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
      throw new ForbiddenException('Seul le propriétaire de la boutique peut relancer la recherche de livreur')
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
   * one blocks the manual move, a courier is already on it.
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
    // A failed hand-over stays failed: the order is cancelled after it (a
    // gift refunded), and the courier already knows, they declared it.
    if (!delivery || delivery.status === DeliveryStatus.CANCELLED || delivery.status === DeliveryStatus.DELIVERED || delivery.status === DeliveryStatus.FAILED) {
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

  /**
   * `refresh` re-reads the row: after a raw UPDATE, the copy already in the
   * identity map still holds the values from before it.
   */
  private async loadDelivery(deliveryId: string, options: { refresh?: boolean } = {}): Promise<Delivery> {
    const delivery = await this.em.findOne(Delivery, { id: deliveryId }, {
      populate: [...DELIVERY_POPULATE],
      refresh: options.refresh,
    })
    if (!delivery) {
      throw new NotFoundException('Livraison introuvable')
    }
    return delivery
  }

  private async loadOwnedDelivery(deliveryId: string, userId: string): Promise<Delivery> {
    const delivery = await this.loadDelivery(deliveryId)
    if (delivery.courier?.user?.id !== userId) {
      const profile = await this.em.findOne(CourierProfile, { user: { id: userId } })
      if (!profile || delivery.courier?.id !== profile.id) {
        throw new ForbiddenException('Cette livraison ne vous est pas attribuée')
      }
    }
    return delivery
  }

  /** What the courier reads when the step does not match. */
  private static readonly STEP_LABELS: Record<string, string> = {
    AWAITING_COURIER: 'en attente d\'un livreur',
    ACCEPTED: 'acceptée, colis pas encore récupéré',
    PICKED_UP: 'colis récupéré',
    IN_TRANSIT: 'en route',
    DELIVERED: 'déjà remise',
    FAILED: 'échouée',
    CANCELLED: 'annulée',
  }

  private assertStatus(delivery: Delivery, expected: DeliveryStatus): void {
    if (delivery.status !== expected) {
      // "Cannot transition from DELIVERED (expected IN_TRANSIT)" means
      // nothing to someone holding a parcel on a doorstep.
      const now = DeliveriesService.STEP_LABELS[delivery.status] ?? delivery.status
      throw new BadRequestException(`Cette course est ${now} : rafraîchissez la liste pour voir où elle en est.`)
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
    // The relative a cart was sent to, by their verified number (009): they
    // follow the courier and rate them, without the amounts.
    if (await isLinkedRecipient(this.em, delivery.order.id, userId)) {
      return 'recipient'
    }
    if (delivery.courier) {
      const profile = await this.em.findOne(CourierProfile, { user: { id: userId } })
      if (profile && delivery.courier.id === profile.id) {
        return 'courier'
      }
    }
    throw new ForbiddenException('Vous ne participez pas à cette livraison')
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
