import type { INestApplication } from '@nestjs/common'
import type { TerroirCheckoutInput } from '../contracts/terroir.contract'
import type { TerroirWorld } from './terroir-checkout.fixture'
import { EntityManager } from '@mikro-orm/postgresql'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { Order, OrderStatus } from '../../orders/entities/order.entity'
import { OrdersService } from '../../orders/orders.service'
import { PaymentGatewayFactory } from '../../payments/gateways/payment-gateway.factory'
import { PaymentProvider } from '../../payments/payment.entity'
import { TopupService } from '../../wallet/topup.service'
import { ExportDepartureStatus, ExportReception, ExportShipmentStatus, ExportSupplementStatus } from '../contracts/terroir.contract'
import { ExportDepartureAlert } from '../entities/export-departure-alert.entity'
import { ExportDeparture } from '../entities/export-departure.entity'
import { ExportShipmentEvent } from '../entities/export-shipment-event.entity'
import { ExportShipment } from '../entities/export-shipment.entity'
import { ExportLogisticsService } from '../export-logistics.service'
import { ExportShipmentsService } from '../export-shipments.service'
import { ExportSupplementService } from '../export-supplement.service'
import { TerroirCheckoutService } from '../terroir-checkout.service'
import { TerroirModule } from '../terroir.module'
import { TerroirScheduler } from '../terroir.scheduler'
import { balanceOfShop, balanceOfUser, exportMovements, fakeCardGateway, seedDeparture, seedTerroirWorld, terroirCart } from './terroir-checkout.fixture'
import { refusalOf } from './terroir.fixture'

const HOUR_MS = 60 * 60 * 1000

interface Context { em: EntityManager, app: INestApplication }

function fresh({ app, em }: Context): void {
  app.get(EntityManager).clear()
  em.clear()
}

/** Pays a terroir parcel from the wallet; returns the parcel and its orders. */
async function buy(ctx: Context, world: TerroirWorld, lines: TerroirCheckoutInput['lines'], overrides: Partial<TerroirCheckoutInput> = {}): Promise<{ shipmentId: string, orders: Order[] }> {
  const created = await ctx.app.get(TerroirCheckoutService).create(world.buyerId, terroirCart(lines, { departureId: world.departureId, ...overrides }))
  fresh(ctx)
  const orders = await ctx.em.find(Order, { checkout: created.checkout.id }, { populate: ['supplier', 'items'] })
  return { shipmentId: created.shipment.id, orders }
}

function orderOf(orders: Order[], supplierId: string): Order {
  return orders.find(order => order.supplier.id === supplierId)!
}

/** Every shop accepts, then eBio collects them all: the parcel is PACKED. */
async function acceptAndCollect(ctx: Context, world: TerroirWorld, shipmentId: string, orders: Order[]): Promise<void> {
  for (const order of orders) {
    await ctx.app.get(OrdersService).accept(order.id, order.supplier.id)
  }
  for (const order of orders) {
    await ctx.app.get(ExportShipmentsService).collect(shipmentId, order.supplier.id, world.agentId)
  }
  fresh(ctx)
}

async function shipmentOf(ctx: Context, id: string): Promise<ExportShipment> {
  return ctx.em.findOneOrFail(ExportShipment, { id }, { refresh: true })
}

/**
 * T043 (US4, US5, US6): collection pays each shop its own part at once;
 * a missing product, a refused order, a lost parcel are refunded without
 * ever debiting a shop; a weight supplement is asked beyond 10 % and
 * absorbed after 48 h; one step moves every parcel of a departure.
 */
describe('terroir, colis : collecte, pesée, suivi, pertes (e2e)', { timeout: 60_000 }, () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 6 }, {
      imports: [RolesModule, AuditModule, TerroirModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('collecte : commande de la boutique livrée, portefeuille crédité tout de suite de sa seule part ; colis COLLECTING puis PACKED', async (context) => {
    const ctx = context as unknown as Context
    const world = await seedTerroirWorld(ctx.app, ctx.em, { balance: 200_000 })
    const { shipmentId, orders } = await buy(ctx, world, [
      { productId: world.shopA.productIds[0], quantity: 2 },
      { productId: world.shopB.productIds[1], quantity: 1 },
    ])
    for (const order of orders) {
      await ctx.app.get(OrdersService).accept(order.id, order.supplier.id)
    }
    const service = ctx.app.get(ExportShipmentsService)

    // A shop that has not accepted cannot be collected: covered by the accept above.
    await service.collect(shipmentId, world.shopA.supplierId, world.agentId)
    fresh(ctx)

    const orderA = await ctx.em.findOneOrFail(Order, { id: orderOf(orders, world.shopA.supplierId).id })
    expect(orderA.status).toBe(OrderStatus.DELIVERED)
    expect(orderA.deliveredAt).toBeTruthy()
    expect(orderA.escrowReleasedAt).toBeTruthy()
    expect(await balanceOfShop(ctx.em, world.shopA.supplierId)).toBe(Number(orderA.totalAmount) - Number(orderA.commissionAmount))
    expect(await balanceOfShop(ctx.em, world.shopB.supplierId)).toBe(0)
    expect((await shipmentOf(ctx, shipmentId)).status).toBe(ExportShipmentStatus.COLLECTING)

    await service.collect(shipmentId, world.shopB.supplierId, world.agentId)
    fresh(ctx)
    const orderB = await ctx.em.findOneOrFail(Order, { id: orderOf(orders, world.shopB.supplierId).id })
    expect(await balanceOfShop(ctx.em, world.shopB.supplierId)).toBe(Number(orderB.totalAmount) - Number(orderB.commissionAmount))
    expect((await shipmentOf(ctx, shipmentId)).status).toBe(ExportShipmentStatus.PACKED)
    const steps = (await ctx.em.find(ExportShipmentEvent, { shipment: shipmentId }, { orderBy: { createdAt: 'ASC' } })).map(event => event.step)
    expect(steps).toEqual([ExportShipmentStatus.PAID, ExportShipmentStatus.COLLECTING, ExportShipmentStatus.PACKED])
  })

  it('produit manquant : ligne retirée, produit et part de transport remboursés, boutique payée du reste', async (context) => {
    const ctx = context as unknown as Context
    const world = await seedTerroirWorld(ctx.app, ctx.em, { balance: 200_000 })
    // 280 + 10 × 500 + 300 g = 5 580 g → 47 430 FCFA of shipping.
    const { shipmentId, orders } = await buy(ctx, world, [
      { productId: world.shopA.productIds[0], quantity: 1 },
      { productId: world.shopA.productIds[2], quantity: 10 },
    ])
    expect(Number((await shipmentOf(ctx, shipmentId)).shippingPrice)).toBe(47_430)
    const order = orders[0]
    await ctx.app.get(OrdersService).accept(order.id, order.supplier.id)
    const before = await balanceOfUser(ctx.em, world.buyerId)
    const missingLine = order.items.getItems().find(item => item.product.id === world.shopA.productIds[0])!

    await ctx.app.get(ExportShipmentsService).missing(shipmentId, missingLine.id, world.agentId)
    fresh(ctx)

    // 5 300 g → 45 050: 2 380 of shipping back, with the 3 000 of the product.
    const shipment = await shipmentOf(ctx, shipmentId)
    expect(shipment.estimatedWeightG).toBe(5300)
    expect(Number(shipment.shippingPrice)).toBe(45_050)
    expect(Number(shipment.declaredValue)).toBe(15_000)
    expect(await balanceOfUser(ctx.em, world.buyerId)).toBe(before + 3000 + 2380)
    const reloaded = await ctx.em.findOneOrFail(Order, { id: order.id }, { populate: ['items'] })
    expect(Number(reloaded.totalAmount)).toBe(15_000)
    expect(reloaded.items.length).toBe(1)

    await ctx.app.get(ExportShipmentsService).collect(shipmentId, world.shopA.supplierId, world.agentId)
    fresh(ctx)
    const collected = await ctx.em.findOneOrFail(Order, { id: order.id })
    expect(await balanceOfShop(ctx.em, world.shopA.supplierId)).toBe(15_000 - Number(collected.commissionAmount))
    expect((await shipmentOf(ctx, shipmentId)).status).toBe(ExportShipmentStatus.PACKED)
  })

  it('commande refusée par une boutique : transport allégé remboursé ; plus aucune commande → colis annulé, tout remboursé', async (context) => {
    const ctx = context as unknown as Context
    const world = await seedTerroirWorld(ctx.app, ctx.em, { balance: 200_000 })
    const start = await balanceOfUser(ctx.em, world.buyerId)
    // 10 × 500 + 280 + 300 g = 5 580 g → 47 430; insured: 3 % of 18 000 → 1 000 minimum.
    const { shipmentId, orders } = await buy(ctx, world, [
      { productId: world.shopA.productIds[2], quantity: 10 },
      { productId: world.shopB.productIds[0], quantity: 1 },
    ], { insured: true })
    const paid = start - await balanceOfUser(ctx.em, world.buyerId)
    expect(paid).toBe(15_000 + 3000 + 47_430 + 1000)
    const ordersService = ctx.app.get(OrdersService)

    await ordersService.reject(orderOf(orders, world.shopB.supplierId).id, world.shopB.supplierId, 'Rupture de stock')
    fresh(ctx)
    let shipment = await shipmentOf(ctx, shipmentId)
    expect(shipment.status).toBe(ExportShipmentStatus.PAID)
    expect(shipment.estimatedWeightG).toBe(5300)
    expect(Number(shipment.shippingPrice)).toBe(45_050)
    expect(await balanceOfUser(ctx.em, world.buyerId)).toBe(start - paid + 3000 + 2380)

    await ordersService.reject(orderOf(orders, world.shopA.supplierId).id, world.shopA.supplierId, 'Fermeture')
    fresh(ctx)
    shipment = await shipmentOf(ctx, shipmentId)
    expect(shipment.status).toBe(ExportShipmentStatus.CANCELLED)
    expect(await balanceOfUser(ctx.em, world.buyerId)).toBe(start)
    expect(await balanceOfShop(ctx.em, world.shopA.supplierId)).toBe(0)
    const exportNet = (await exportMovements(ctx.em)).reduce((total, movement) => total + movement.amount, 0)
    expect(exportNet).toBe(0)
    const last = await ctx.em.find(ExportShipmentEvent, { shipment: shipmentId }, { orderBy: { createdAt: 'DESC' }, limit: 1 })
    expect(last[0].step).toBe(ExportShipmentStatus.CANCELLED)
  })

  it('pesée : écart toléré absorbé ; au-delà de 10 % complément demandé, puis pris en charge à 48 h sur le compte EXPORT', async (context) => {
    const ctx = context as unknown as Context
    const world = await seedTerroirWorld(ctx.app, ctx.em, { balance: 200_000 })
    // 10 × 500 + 300 g = 5 300 g → 45 050.
    const { shipmentId, orders } = await buy(ctx, world, [{ productId: world.shopA.productIds[2], quantity: 10 }])
    await acceptAndCollect(ctx, world, shipmentId, orders)
    const service = ctx.app.get(ExportShipmentsService)

    await service.weigh(shipmentId, 5800, world.agentId)
    fresh(ctx)
    expect((await shipmentOf(ctx, shipmentId)).supplementStatus).toBe(ExportSupplementStatus.NONE)

    await service.weigh(shipmentId, 6200, world.agentId)
    fresh(ctx)
    const asked = await shipmentOf(ctx, shipmentId)
    expect(asked.supplementStatus).toBe(ExportSupplementStatus.REQUESTED)
    // 6,2 kg → 52 700 instead of 45 050.
    expect(Number(asked.supplementAmount)).toBe(7650)

    const supplements = ctx.app.get(ExportSupplementService)
    expect(await supplements.waiveOverdue(new Date(Date.now() + 47 * HOUR_MS))).toBe(0)
    expect(await supplements.waiveOverdue(new Date(Date.now() + 49 * HOUR_MS))).toBe(1)
    fresh(ctx)
    expect((await shipmentOf(ctx, shipmentId)).supplementStatus).toBe(ExportSupplementStatus.WAIVED)
    expect((await exportMovements(ctx.em)).filter(movement => movement.type === 'EXPORT_LOSS')).toEqual([{ type: 'EXPORT_LOSS', amount: -7650 }])
    expect(await refusalOf(service.weigh(shipmentId, 5000, world.agentId))).toEqual({ status: 409, code: 'EXPORT_SUPPLEMENT_SETTLED' })
  })

  it('complément payé par carte : recharge ouverte, et réglé dès que la recharge est créditée', async (context) => {
    const ctx = context as unknown as Context
    const world = await seedTerroirWorld(ctx.app, ctx.em, { balance: 200_000 })
    const { shipmentId, orders } = await buy(ctx, world, [{ productId: world.shopA.productIds[2], quantity: 10 }])
    await acceptAndCollect(ctx, world, shipmentId, orders)
    await ctx.app.get(ExportShipmentsService).weigh(shipmentId, 6200, world.agentId)
    fakeCardGateway(ctx.app)
    // WalletModule has its own factory instance: the top-up must see the fake too.
    const factory = (ctx.app.get(TopupService) as unknown as { gatewayFactory: PaymentGatewayFactory }).gatewayFactory
    vi.spyOn(factory, 'createGateway').mockImplementation(() => ctx.app.get(PaymentGatewayFactory).createGateway(PaymentProvider.INTRAM))
    const before = await balanceOfUser(ctx.em, world.buyerId)

    const outcome = await ctx.app.get(ExportSupplementService).choose(world.buyerId, shipmentId, { choice: 'PAY', paymentMethod: 'FEDAPAY' })
    expect(outcome.paymentUrl).toBe('https://pay.example/terroir')
    expect(outcome.topupId).toBeTruthy()

    await ctx.app.get(TopupService).verify(world.buyerId, outcome.topupId!, outcome.providerTransactionId!)
    fresh(ctx)
    expect((await shipmentOf(ctx, shipmentId)).supplementStatus).toBe(ExportSupplementStatus.PAID)
    // Credited 7 650 by the top-up, debited 7 650 by the supplement.
    expect(await balanceOfUser(ctx.em, world.buyerId)).toBe(before)
    expect((await exportMovements(ctx.em)).some(movement => movement.type === 'EXPORT_SHIPPING_INCOME' && movement.amount === 7650)).toBe(true)
  })

  it('colis perdu : produits et transport remboursés, boutique non débitée, perte sur EXPORT', async (context) => {
    const ctx = context as unknown as Context
    const world = await seedTerroirWorld(ctx.app, ctx.em, { balance: 200_000 })
    const { shipmentId, orders } = await buy(ctx, world, [{ productId: world.shopA.productIds[0], quantity: 1 }])
    await acceptAndCollect(ctx, world, shipmentId, orders)
    const service = ctx.app.get(ExportShipmentsService)
    await service.addEvent(shipmentId, { step: ExportShipmentStatus.DROPPED_AT_AGENCY }, world.agentId)
    const shop = await balanceOfShop(ctx.em, world.shopA.supplierId)
    const buyer = await balanceOfUser(ctx.em, world.buyerId)

    await service.lost(shipmentId, false, world.agentId)
    fresh(ctx)

    expect((await shipmentOf(ctx, shipmentId)).status).toBe(ExportShipmentStatus.LOST)
    expect(await balanceOfUser(ctx.em, world.buyerId)).toBe(buyer + 3000 + 42_500)
    expect(await balanceOfShop(ctx.em, world.shopA.supplierId)).toBe(shop)
    expect((await exportMovements(ctx.em)).filter(movement => movement.type === 'EXPORT_LOSS')).toEqual([{ type: 'EXPORT_LOSS', amount: -45_500 }])
    expect(await refusalOf(service.lost(shipmentId, false, world.agentId))).toEqual({ status: 409, code: 'EXPORT_SHIPMENT_STATE' })
  })

  it('colis assuré abîmé : remboursement intégral, livraison à domicile comprise ; assurance suivie à part', async (context) => {
    const ctx = context as unknown as Context
    const world = await seedTerroirWorld(ctx.app, ctx.em, { balance: 200_000 })
    const { shipmentId, orders } = await buy(ctx, world, [{ productId: world.shopA.productIds[0], quantity: 1 }], {
      insured: true,
      reception: ExportReception.HOME,
      homeAddress: '8 rue des Poissonniers, 75018 Paris',
    })
    await acceptAndCollect(ctx, world, shipmentId, orders)
    const service = ctx.app.get(ExportShipmentsService)
    await service.addEvent(shipmentId, { step: ExportShipmentStatus.DEPARTED }, world.agentId)
    const shop = await balanceOfShop(ctx.em, world.shopA.supplierId)
    const buyer = await balanceOfUser(ctx.em, world.buyerId)

    await service.lost(shipmentId, true, world.agentId)
    fresh(ctx)

    expect((await shipmentOf(ctx, shipmentId)).status).toBe(ExportShipmentStatus.DAMAGED)
    expect(await balanceOfUser(ctx.em, world.buyerId)).toBe(buyer + 3000 + 42_500 + 3900)
    expect(await balanceOfShop(ctx.em, world.shopA.supplierId)).toBe(shop)
    const movements = await exportMovements(ctx.em)
    expect(movements.filter(movement => movement.type === 'EXPORT_INSURANCE_INCOME')).toEqual([{ type: 'EXPORT_INSURANCE_INCOME', amount: 1000 }])
    expect(movements.filter(movement => movement.type === 'EXPORT_LOSS')).toEqual([{ type: 'EXPORT_LOSS', amount: -49_400 }])
  })

  it('étape de départ : appliquée à tous les colis en une requête, et le départ passe parti', async (context) => {
    const ctx = context as unknown as Context
    const world = await seedTerroirWorld(ctx.app, ctx.em, { balance: 300_000 })
    const first = await buy(ctx, world, [{ productId: world.shopA.productIds[0], quantity: 1 }])
    const second = await buy(ctx, world, [{ productId: world.shopB.productIds[1], quantity: 2 }])
    await acceptAndCollect(ctx, world, first.shipmentId, first.orders)
    await acceptAndCollect(ctx, world, second.shipmentId, second.orders)
    const service = ctx.app.get(ExportShipmentsService)

    expect(await service.addDepartureEvent(world.departureId, { step: ExportShipmentStatus.DEPARTED, message: 'Vol AF 0761' }, world.agentId)).toEqual({ applied: 2 })
    fresh(ctx)
    for (const id of [first.shipmentId, second.shipmentId]) {
      expect((await shipmentOf(ctx, id)).status).toBe(ExportShipmentStatus.DEPARTED)
      const events = await ctx.em.find(ExportShipmentEvent, { shipment: id, step: ExportShipmentStatus.DEPARTED })
      expect(events.map(event => event.message)).toEqual(['Vol AF 0761'])
    }
    expect((await ctx.em.findOneOrFail(ExportDeparture, { id: world.departureId })).status).toBe(ExportDepartureStatus.DEPARTED)

    // Ready for pickup: the address and hours are frozen on the event.
    await service.addDepartureEvent(world.departureId, { step: ExportShipmentStatus.READY_FOR_PICKUP }, world.agentId)
    fresh(ctx)
    const ready = await ctx.em.findOneOrFail(ExportShipmentEvent, { shipment: first.shipmentId, step: ExportShipmentStatus.READY_FOR_PICKUP })
    expect(ready.pickupPointSnapshot).toBe('12 rue Myrha, 75018 Paris, mar.–sam. 10 h–19 h')
    expect(await refusalOf(service.addEvent(first.shipmentId, { step: ExportShipmentStatus.LOST }, world.agentId))).toEqual({ status: 400, code: 'EXPORT_STEP_INVALID' })
  })

  it('alertes : envoyées une fois à l\'ouverture d\'un départ ; rappel des 48 h une seule fois pour un aperçu non payé', async (context) => {
    const ctx = context as unknown as Context
    const world = await seedTerroirWorld(ctx.app, ctx.em)
    const logistics = ctx.app.get(ExportLogisticsService)
    await logistics.subscribeAlert(world.buyerId, 'FR')
    await logistics.subscribeAlert(world.buyerId, 'FR')

    await seedDeparture(ctx.app, world.agentId, world.agencyId)
    fresh(ctx)
    const alerts = await ctx.em.find(ExportDepartureAlert, { user: world.buyerId })
    expect(alerts).toHaveLength(1)
    expect(alerts[0].sentAt).toBeTruthy()

    // Order deadline: deposit (8 days) minus 3 days of collection.
    await ctx.app.get(TerroirCheckoutService).preview(world.buyerId, terroirCart([{ productId: world.shopA.productIds[0], quantity: 1 }], { departureId: world.departureId }))
    const scheduler = ctx.app.get(TerroirScheduler)
    expect(await scheduler.remindDeadlines(new Date(Date.now() + 2 * 24 * HOUR_MS))).toBe(0)
    expect(await scheduler.remindDeadlines(new Date(Date.now() + 4 * 24 * HOUR_MS))).toBe(1)
    expect(await scheduler.remindDeadlines(new Date(Date.now() + 4 * 24 * HOUR_MS))).toBe(0)
  })
})
