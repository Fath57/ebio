import type { INestApplication } from '@nestjs/common'
import type { TerroirCheckoutInput } from '../contracts/terroir.contract'
import type { TerroirWorld } from './terroir-checkout.fixture'
import { EntityManager } from '@mikro-orm/postgresql'
import { beforeEach, describe, expect, it } from 'vitest'
import { createUserData } from '../../../factories/user.factory'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { DeliveriesMapper } from '../../deliveries/deliveries.mapper'
import { DeliveriesService } from '../../deliveries/deliveries.service'
import { Delivery, DeliveryPurpose, DeliveryStatus } from '../../deliveries/entities/delivery.entity'
import { Order, OrderStatus } from '../../orders/entities/order.entity'
import { OrdersService } from '../../orders/orders.service'
import { PlatformSettingsService } from '../../settings/platform-settings.service'
import { ExportShipmentStatus } from '../contracts/terroir.contract'
import { ExportShipmentEvent } from '../entities/export-shipment-event.entity'
import { ExportShipment } from '../entities/export-shipment.entity'
import { ExportLogisticsService } from '../export-logistics.service'
import { ExportShipmentsService } from '../export-shipments.service'
import { TerroirCheckoutService } from '../terroir-checkout.service'
import { TerroirMapper } from '../terroir.mapper'
import { TerroirModule } from '../terroir.module'
import { balanceOfShop, exportMovements, seedTerroirWorld, terroirCart } from './terroir-checkout.fixture'
import { refusalOf } from './terroir.fixture'

interface Context { em: EntityManager, app: INestApplication }

/** The eBio hub, about 4 km west of the seeded shops (Cotonou). */
const HUB = {
  collectionMode: 'COURIER' as const,
  hubName: 'Point eBio Cadjehoun',
  hubAddress: 'Rue 12.034, Cadjehoun, Cotonou',
  hubLatitude: 6.3654,
  hubLongitude: 2.3912,
  hubPhone: '+229 90 00 00 00',
  hubHours: 'lun.-sam. 8 h-18 h',
}

function fresh({ app, em }: Context): void {
  app.get(EntityManager).clear()
  em.clear()
}

/** A validated, available courier standing next to the shops. */
async function seedCourier(em: EntityManager): Promise<{ courierId: string, userId: string }> {
  const user = await createUserData(em, { name: 'Koffi Livreur' })
  const [row] = await em.getConnection().execute(
    `INSERT INTO courier_profiles
       (user_id, full_name, phone, vehicle_type, zone, validation_status, is_available,
        last_known_location, last_location_at, "createdAt", "updatedAt")
     VALUES (?, 'Koffi Livreur', '+22997000000', 'MOTO', 'Cotonou', 'VALIDATED', true,
             ST_SetSRID(ST_MakePoint(2.4250, 6.3620), 4326)::geography, NOW(), NOW(), NOW())
     RETURNING id`,
    [user.id],
  ) as Array<{ id: string }>
  return { courierId: row.id, userId: user.id }
}

async function buy(ctx: Context, world: TerroirWorld, lines: TerroirCheckoutInput['lines']): Promise<{ shipmentId: string, orders: Order[] }> {
  const created = await ctx.app.get(TerroirCheckoutService).create(world.buyerId, terroirCart(lines, { departureId: world.departureId }))
  fresh(ctx)
  const orders = await ctx.em.find(Order, { checkout: created.checkout.id }, { populate: ['supplier', 'items'] })
  return { shipmentId: created.shipment.id, orders }
}

/** Two shops in one parcel, both accepted. */
async function twoShopParcel(ctx: Context, world: TerroirWorld): Promise<{ shipmentId: string, orderA: Order, orderB: Order }> {
  const { shipmentId, orders } = await buy(ctx, world, [
    { productId: world.shopA.productIds[0], quantity: 2 },
    { productId: world.shopB.productIds[1], quantity: 1 },
  ])
  const service = ctx.app.get(OrdersService)
  for (const order of orders) {
    await service.accept(order.id, order.supplier.id)
  }
  fresh(ctx)
  return {
    shipmentId,
    orderA: orders.find(order => order.supplier.id === world.shopA.supplierId)!,
    orderB: orders.find(order => order.supplier.id === world.shopB.supplierId)!,
  }
}

/** The shop prepares, then marks the order READY (« Prête pour la collecte »). */
async function markReady(ctx: Context, order: Order): Promise<void> {
  const service = ctx.app.get(OrdersService)
  await service.updateStatus(order.id, order.supplier.id, OrderStatus.PREPARING)
  await service.updateStatus(order.id, order.supplier.id, OrderStatus.READY)
  fresh(ctx)
}

async function deliveryOf(ctx: Context, orderId: string): Promise<Delivery | null> {
  return ctx.em.findOne(Delivery, { order: orderId }, { refresh: true })
}

async function courierBalance(em: EntityManager, courierId: string): Promise<number> {
  const [row] = await em.getConnection().execute(`SELECT balance FROM wallets WHERE courier_profile_id = ?`, [courierId]) as Array<{ balance: string }>
  return row ? Number(row.balance) : 0
}

async function countMovements(em: EntityManager, deliveryId: string, type: string): Promise<number> {
  const [row] = await em.getConnection().execute(`SELECT COUNT(*) AS n FROM wallet_transactions WHERE delivery_id = ? AND type = ?`, [deliveryId, type]) as Array<{ n: string }>
  return Number(row.n)
}

async function orderStatus(ctx: Context, orderId: string): Promise<OrderStatus> {
  return (await ctx.em.findOneOrFail(Order, { id: orderId }, { refresh: true })).status
}

async function shipmentStatus(ctx: Context, shipmentId: string): Promise<ExportShipmentStatus> {
  return (await ctx.em.findOneOrFail(ExportShipment, { id: shipmentId }, { refresh: true })).status
}

/** The courier takes the run and leaves the shop with the parcel. */
async function acceptAndPickUp(ctx: Context, deliveryId: string, courierUserId: string): Promise<void> {
  const deliveries = ctx.app.get(DeliveriesService)
  await deliveries.accept(deliveryId, courierUserId)
  await deliveries.pickup(deliveryId, courierUserId)
  fresh(ctx)
}

/**
 * 011, collection by eBio couriers: a shop's READY terroir order becomes a
 * run shop → eBio hub, paid by eBio from its EXPORT account, closed with
 * the hub's code or the back office's « Reçu », and idempotent with
 * « Collecté ».
 */
describe('terroir, collecte des boutiques par les livreurs eBio (e2e)', { timeout: 60_000 }, () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 6 }, {
      imports: [RolesModule, AuditModule, TerroirModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('prête en mode COURIER : une course boutique → point eBio, payée par eBio ; code du point, puis « Reçu » : boutiques payées, livreur crédité, colis PACKED', async (context) => {
    const ctx = context as unknown as Context
    const world = await seedTerroirWorld(ctx.app, ctx.em, { balance: 200_000 })
    await ctx.app.get(PlatformSettingsService).setTerroirExportSettings(HUB)
    const courier = await seedCourier(ctx.em)
    const { shipmentId, orderA, orderB } = await twoShopParcel(ctx, world)
    const deliveries = ctx.app.get(DeliveriesService)

    await markReady(ctx, orderA)
    const runA = (await deliveryOf(ctx, orderA.id))!
    expect(runA.purpose).toBe(DeliveryPurpose.EXPORT_COLLECTION)
    expect(runA.exportShipmentId).toBe(shipmentId)
    expect(runA.dropoffLatitude).toBe(HUB.hubLatitude)
    expect(runA.dropoffAddress).toBe(`${HUB.hubName}, ${HUB.hubAddress}`)
    expect(runA.deliveryFee).toBeGreaterThan(0)
    expect(runA.courierFee).toBe(Math.round(runA.deliveryFee * 0.9))
    expect(runA.confirmationCode).toMatch(/^\d{6}$/)
    expect(Number((await ctx.em.findOneOrFail(Order, { id: orderA.id })).deliveryFee)).toBe(0)
    expect(await ctx.em.count(Delivery, { order: orderA.id })).toBe(1)

    // The courier sees one offer, to the hub, nothing to collect in cash.
    const offers = await deliveries.getOffers(courier.userId)
    expect(offers.map(offer => offer.id)).toEqual([runA.id])
    const offer = DeliveriesMapper.toOffer(offers[0])
    expect(offer.purpose).toBe('EXPORT_COLLECTION')
    expect(offer.exportHub).toEqual({ name: HUB.hubName, address: HUB.hubAddress, phone: HUB.hubPhone, hours: HUB.hubHours })
    expect(offer.dropoffPosition).toEqual({ latitude: HUB.hubLatitude, longitude: HUB.hubLongitude })
    expect(offer.cashToCollect).toBeNull()

    await acceptAndPickUp(ctx, runA.id, courier.userId)
    // The order stays READY while the courier carries it; the buyer reads « en route ».
    expect(await orderStatus(ctx, orderA.id)).toBe(OrderStatus.READY)
    const pickedUp = (await deliveryOf(ctx, orderA.id))!
    expect(pickedUp.confirmationCode).toBe(runA.confirmationCode)
    const messages = (await ctx.em.find(ExportShipmentEvent, { shipment: shipmentId })).map(event => event.message)
    expect(messages).toContain('Les produits de Karité Fatou sont en route vers le point de regroupement eBio.')

    // Wrong code refused, the hub's code closes the run.
    const wrong = runA.confirmationCode === '000000' ? '111111' : '000000'
    expect((await refusalOf(deliveries.complete(runA.id, courier.userId, { proofType: 'CODE', code: wrong }))).status).toBe(422)
    expect((await refusalOf(deliveries.complete(runA.id, courier.userId, { proofType: 'CODE', code: '1234' }))).status).toBe(422)
    await deliveries.complete(runA.id, courier.userId, { proofType: 'CODE', code: runA.confirmationCode! })
    fresh(ctx)

    const deliveredA = await ctx.em.findOneOrFail(Order, { id: orderA.id })
    expect(deliveredA.status).toBe(OrderStatus.DELIVERED)
    expect(deliveredA.escrowReleasedAt).toBeTruthy()
    expect(await balanceOfShop(ctx.em, world.shopA.supplierId)).toBe(Number(deliveredA.totalAmount) - Number(deliveredA.commissionAmount))
    expect(await balanceOfShop(ctx.em, world.shopB.supplierId)).toBe(0)
    expect(await courierBalance(ctx.em, courier.courierId)).toBe(runA.courierFee)
    expect((await exportMovements(ctx.em)).filter(movement => movement.type === 'EXPORT_COLLECTION_COST'))
      .toEqual([{ type: 'EXPORT_COLLECTION_COST', amount: -runA.courierFee }])
    // eBio does not charge itself a commission on its own collection.
    expect(await countMovements(ctx.em, runA.id, 'PLATFORM_DELIVERY_SHARE')).toBe(0)
    expect(await shipmentStatus(ctx, shipmentId)).toBe(ExportShipmentStatus.COLLECTING)

    // Second shop: the hub staff confirm from the back office.
    await markReady(ctx, orderB)
    const runB = (await deliveryOf(ctx, orderB.id))!
    await acceptAndPickUp(ctx, runB.id, courier.userId)

    const detail = TerroirMapper.toDepartureDetail(await ctx.app.get(ExportLogisticsService).detail(world.departureId))
    const groupB = detail.collection.find(group => group.supplierId === world.shopB.supplierId)!
    expect(groupB.collection).toMatchObject({
      mode: 'COURIER',
      deliveryId: runB.id,
      status: DeliveryStatus.PICKED_UP,
      courierName: 'Koffi Livreur',
      courierPhone: '+22997000000',
      hubCode: runB.confirmationCode,
      receivedAt: null,
    })
    expect(groupB.collection?.pickedUpAt).toBeTruthy()
    const groupA = detail.collection.find(group => group.supplierId === world.shopA.supplierId)!
    expect(groupA.collection).toMatchObject({ mode: 'COURIER', status: DeliveryStatus.DELIVERED })
    expect(groupA.collection?.receivedAt).toBeTruthy()

    await ctx.app.get(ExportShipmentsService).receivedAtHub(runB.id, world.agentId)
    fresh(ctx)
    expect(await orderStatus(ctx, orderB.id)).toBe(OrderStatus.DELIVERED)
    const deliveredB = await ctx.em.findOneOrFail(Order, { id: orderB.id })
    expect(await balanceOfShop(ctx.em, world.shopB.supplierId)).toBe(Number(deliveredB.totalAmount) - Number(deliveredB.commissionAmount))
    expect(await courierBalance(ctx.em, courier.courierId)).toBe(runA.courierFee + runB.courierFee)
    expect(await shipmentStatus(ctx, shipmentId)).toBe(ExportShipmentStatus.PACKED)

    // Received twice: nothing moves.
    await ctx.app.get(ExportShipmentsService).receivedAtHub(runB.id, world.agentId)
    fresh(ctx)
    expect(await courierBalance(ctx.em, courier.courierId)).toBe(runA.courierFee + runB.courierFee)
    expect(await countMovements(ctx.em, runB.id, 'EXPORT_COLLECTION_COST')).toBe(1)
  })

  it('« Collecté » d’abord : livreur payé du trajet une fois, la remise par code ensuite ne bouge plus d’argent', async (context) => {
    const ctx = context as unknown as Context
    const world = await seedTerroirWorld(ctx.app, ctx.em, { balance: 200_000 })
    await ctx.app.get(PlatformSettingsService).setTerroirExportSettings(HUB)
    const courier = await seedCourier(ctx.em)
    const { shipmentId, orderA } = await twoShopParcel(ctx, world)
    await markReady(ctx, orderA)
    const run = (await deliveryOf(ctx, orderA.id))!
    await acceptAndPickUp(ctx, run.id, courier.userId)

    await ctx.app.get(ExportShipmentsService).collect(shipmentId, world.shopA.supplierId, world.agentId)
    fresh(ctx)
    const shopPaid = await balanceOfShop(ctx.em, world.shopA.supplierId)
    expect(shopPaid).toBeGreaterThan(0)
    expect((await deliveryOf(ctx, orderA.id))!.status).toBe(DeliveryStatus.DELIVERED)
    expect(await courierBalance(ctx.em, courier.courierId)).toBe(run.courierFee)

    const replay = await ctx.app.get(DeliveriesService).complete(run.id, courier.userId, { proofType: 'CODE', code: run.confirmationCode! })
    expect(replay.status).toBe(DeliveryStatus.DELIVERED)
    fresh(ctx)
    expect(await balanceOfShop(ctx.em, world.shopA.supplierId)).toBe(shopPaid)
    expect(await courierBalance(ctx.em, courier.courierId)).toBe(run.courierFee)
    expect(await countMovements(ctx.em, run.id, 'DELIVERY_EARNING')).toBe(1)
    expect(await countMovements(ctx.em, run.id, 'EXPORT_COLLECTION_COST')).toBe(1)
    expect(await countMovements(ctx.em, run.id, 'SALE_CREDIT')).toBe(0)
  })

  it('« Collecté » avant le retrait : la course est retirée, sans gain', async (context) => {
    const ctx = context as unknown as Context
    const world = await seedTerroirWorld(ctx.app, ctx.em, { balance: 200_000 })
    await ctx.app.get(PlatformSettingsService).setTerroirExportSettings(HUB)
    const courier = await seedCourier(ctx.em)
    const { shipmentId, orderA } = await twoShopParcel(ctx, world)
    await markReady(ctx, orderA)
    const run = (await deliveryOf(ctx, orderA.id))!
    await ctx.app.get(DeliveriesService).accept(run.id, courier.userId)

    await ctx.app.get(ExportShipmentsService).collect(shipmentId, world.shopA.supplierId, world.agentId)
    fresh(ctx)
    expect((await deliveryOf(ctx, orderA.id))!.status).toBe(DeliveryStatus.CANCELLED)
    expect(await courierBalance(ctx.em, courier.courierId)).toBe(0)
    expect(await refusalOf(ctx.app.get(ExportShipmentsService).receivedAtHub(run.id, world.agentId))).toEqual({ status: 409, code: 'EXPORT_COLLECTION_NO_COURIER' })
  })

  it('mode EBIO : aucune course ; COURIER sans coordonnées du point : repli sur EBIO', async (context) => {
    const ctx = context as unknown as Context
    const world = await seedTerroirWorld(ctx.app, ctx.em, { balance: 200_000 })
    const settings = ctx.app.get(PlatformSettingsService)
    await settings.setTerroirExportSettings({ ...HUB, collectionMode: 'EBIO' })
    const { orderA, orderB } = await twoShopParcel(ctx, world)

    await markReady(ctx, orderA)
    expect(await deliveryOf(ctx, orderA.id)).toBeNull()

    const saved = await settings.setTerroirExportSettings({ collectionMode: 'COURIER', hubLatitude: null, hubLongitude: null })
    expect(saved.collectionMode).toBe('COURIER')
    expect(saved.effectiveCollectionMode).toBe('EBIO')
    await markReady(ctx, orderB)
    expect(await deliveryOf(ctx, orderB.id)).toBeNull()
    expect(await orderStatus(ctx, orderB.id)).toBe(OrderStatus.READY)

    const detail = TerroirMapper.toDepartureDetail(await ctx.app.get(ExportLogisticsService).detail(world.departureId))
    expect(detail.collection.every(group => group.collection?.mode === 'EBIO' && group.collection.deliveryId === null)).toBe(true)

    // A half position is refused: couriers would be sent nowhere.
    expect((await refusalOf(settings.setTerroirExportSettings({ hubLatitude: 6.36 }))).status).toBe(400)
  })

  it('commande annulée : la course en attente est annulée, sans gain ; échec du livreur : course proposée à nouveau', async (context) => {
    const ctx = context as unknown as Context
    const world = await seedTerroirWorld(ctx.app, ctx.em, { balance: 200_000 })
    await ctx.app.get(PlatformSettingsService).setTerroirExportSettings(HUB)
    const courier = await seedCourier(ctx.em)
    const { orderA, orderB } = await twoShopParcel(ctx, world)
    const deliveries = ctx.app.get(DeliveriesService)

    await markReady(ctx, orderA)
    const pending = (await deliveryOf(ctx, orderA.id))!
    await ctx.app.get(OrdersService).adminUpdateStatus(orderA.id, OrderStatus.CANCELLED, { silent: true })
    fresh(ctx)
    expect((await deliveryOf(ctx, orderA.id))!.status).toBe(DeliveryStatus.CANCELLED)
    expect(await countMovements(ctx.em, pending.id, 'DELIVERY_EARNING')).toBe(0)
    expect((await refusalOf(deliveries.accept(pending.id, courier.userId))).status).toBe(410)

    await markReady(ctx, orderB)
    const run = (await deliveryOf(ctx, orderB.id))!
    await acceptAndPickUp(ctx, run.id, courier.userId)
    await deliveries.fail(run.id, courier.userId, { reason: 'OTHER', comment: 'Pneu crevé' })
    fresh(ctx)
    const reoffered = (await deliveryOf(ctx, orderB.id))!
    expect(reoffered.status).toBe(DeliveryStatus.AWAITING_COURIER)
    expect(reoffered.courier).toBeNull()
    expect(reoffered.reassignmentCount).toBe(1)
    expect(await orderStatus(ctx, orderB.id)).toBe(OrderStatus.READY)
    expect(await courierBalance(ctx.em, courier.courierId)).toBe(0)
    // Offered again, to the same courier as anyone else (broadcast).
    expect((await deliveries.getOffers(courier.userId)).map(offer => offer.id)).toContain(run.id)
  })
})
