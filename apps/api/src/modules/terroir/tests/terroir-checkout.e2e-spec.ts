import type { INestApplication } from '@nestjs/common'
import { EntityManager } from '@mikro-orm/postgresql'
import { beforeEach, describe, expect, it } from 'vitest'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { Notification, NotificationType } from '../../notifications/notification.entity'
import { Order, PickupMode } from '../../orders/entities/order.entity'
import { Checkout, CheckoutStatus } from '../../payments/entities/checkout.entity'
import { Payment } from '../../payments/payment.entity'
import { PaymentsService } from '../../payments/payments.service'
import { ExportShipmentStatus } from '../contracts/terroir.contract'
import { ExportCheckoutDraft } from '../entities/export-checkout-draft.entity'
import { ExportShipmentEvent } from '../entities/export-shipment-event.entity'
import { ExportShipment } from '../entities/export-shipment.entity'
import { ExportCatalogService } from '../export-catalog.service'
import { ExportLogisticsService } from '../export-logistics.service'
import { TerroirCheckoutService } from '../terroir-checkout.service'
import { TerroirModule } from '../terroir.module'
import { balanceOfShop, balanceOfUser, exportMovements, fakeCardGateway, seedTerroirWorld, terroirCart, topUp } from './terroir-checkout.fixture'
import { refusalOf } from './terroir.fixture'

function fresh(app: INestApplication, em: EntityManager): void {
  app.get(EntityManager).clear()
  em.clear()
}

/**
 * US1 (T029): one parcel for several shops, EXPORT orders at no delivery
 * fee, an exact total, prices frozen at payment — and the shipping never
 * reaching a shop: it goes to eBio's EXPORT account.
 */
describe('terroir — passage en caisse (e2e)', { timeout: 30_000 }, () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 6 }, {
      imports: [RolesModule, AuditModule, TerroirModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('aperçu : poids, départ le plus proche, marge sous le minimum, suggestions, ligne indisponible, brouillon', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const world = await seedTerroirWorld(app, em)
    const unknown = '00000000-0000-4000-8000-000000000000'

    const quote = await app.get(TerroirCheckoutService).preview(world.buyerId, terroirCart([
      { productId: world.shopA.productIds[0], quantity: 2 },
      { productId: world.shopB.productIds[1], quantity: 1 },
      { productId: unknown, quantity: 1 },
    ]))

    // 2 × 280 + 120 + 300 g of packaging.
    expect(quote.estimatedWeightG).toBe(980)
    expect(quote.selected?.departure.id).toBe(world.departureId)
    expect(quote.billedKg).toBe(5)
    expect(quote.marginKg).toBe(4.02)
    expect(quote.itemsTotal).toBe(8500)
    expect(quote.shippingPrice).toBe(42_500)
    expect(quote.total).toBe(51_000)
    expect(quote.homeDeliveryQuote).toBe(3900)
    expect(quote.insuranceQuote).toBe(1000)
    expect(quote.unavailable).toEqual([{ productId: unknown, packId: null, reason: 'NOT_FOUND' }])
    expect(quote.suggestions.length).toBeGreaterThan(0)
    expect(quote.suggestions.every(profile => profile.packedWeightG <= 4020)).toBe(true)
    const draft = await em.findOne(ExportCheckoutDraft, { user: world.buyerId })
    expect(draft?.departure?.id).toBe(world.departureId)
  })

  it('portefeuille : deux boutiques → un colis, commandes EXPORT sans frais, total exact, transport au compte EXPORT, jamais à la boutique', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const world = await seedTerroirWorld(app, em, { balance: 100_000 })

    const created = await app.get(TerroirCheckoutService).create(world.buyerId, terroirCart([
      { productId: world.shopA.productIds[0], quantity: 2 },
      { productId: world.shopB.productIds[1], quantity: 1 },
    ], { departureId: world.departureId }))
    fresh(app, em)

    expect(created.paymentUrl).toBeNull()
    const checkout = await em.findOneOrFail(Checkout, { id: created.checkout.id })
    expect(checkout.status).toBe(CheckoutStatus.PAID)
    expect(Number(checkout.totalAmount)).toBe(51_000)
    expect(Number(checkout.itemsTotal)).toBe(8500)
    expect(await balanceOfUser(em, world.buyerId)).toBe(49_000)

    const orders = await em.find(Order, { checkout: checkout.id }, { populate: ['supplier'] })
    expect(orders).toHaveLength(2)
    expect(orders.every(order => order.pickupMode === PickupMode.EXPORT && Number(order.deliveryFee) === 0)).toBe(true)
    expect(orders.map(order => Number(order.totalAmount)).sort()).toEqual([2500, 6000])

    const shipments = await em.find(ExportShipment, { checkout: checkout.id })
    expect(shipments).toHaveLength(1)
    expect(shipments[0].status).toBe(ExportShipmentStatus.PAID)
    expect(Number(shipments[0].shippingPrice)).toBe(42_500)
    expect(shipments[0].trackingToken).toHaveLength(32)
    expect(await em.count(ExportShipmentEvent, { shipment: shipments[0].id, step: ExportShipmentStatus.PAID })).toBe(1)

    // Each shop is escrowed its own order, nothing more.
    const payments = await em.find(Payment, { checkout: checkout.id }, { populate: ['order'] })
    expect(payments.map(payment => Number(payment.amount)).sort()).toEqual([2500, 6000])
    expect(await exportMovements(em)).toEqual([{ type: 'EXPORT_SHIPPING_INCOME', amount: 42_500 }])

    // Released (as at collection), the shop nets its sale less the commission — no shipping.
    const shopAOrder = orders.find(order => order.supplier.id === world.shopA.supplierId)!
    const shopAPayment = payments.find(payment => payment.order.id === shopAOrder.id)!
    await app.get(PaymentsService).releaseEscrow(shopAPayment.id)
    expect(await balanceOfShop(em, world.shopA.supplierId)).toBe(6000 - Number(shopAOrder.commissionAmount))
    expect(await em.count(ExportCheckoutDraft, { user: world.buyerId })).toBe(0)
  })

  it('portefeuille insuffisant : rien n\'est créé et personne n\'est notifié ; payé : la boutique est notifiée de son vrai montant', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const world = await seedTerroirWorld(app, em, { balance: 1000 })
    const cart = terroirCart([{ productId: world.shopA.productIds[0], quantity: 2 }], { departureId: world.departureId })

    await expect(app.get(TerroirCheckoutService).create(world.buyerId, cart)).rejects.toThrow()
    fresh(app, em)
    expect(await em.count(Order, {})).toBe(0)
    expect(await em.count(Notification, { type: NotificationType.ORDER_PLACED })).toBe(0)

    await topUp(app, world.buyerId, 100_000)
    await app.get(TerroirCheckoutService).create(world.buyerId, cart)
    fresh(app, em)
    const placed = await em.find(Notification, { type: NotificationType.ORDER_PLACED })
    expect(placed).toHaveLength(2)
    expect(placed.some(notification => notification.body.includes('6000 FCFA'))).toBe(true)
  })

  it('le prix du transport reste figé quand le tarif du départ change', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const world = await seedTerroirWorld(app, em, { balance: 100_000 })
    const created = await app.get(TerroirCheckoutService).create(world.buyerId, terroirCart([
      { productId: world.shopA.productIds[2], quantity: 1 },
    ], { departureId: world.departureId }))

    await app.get(ExportLogisticsService).updateDeparture(world.departureId, {
      rates: [{ country: 'FR' as never, pricePerKg: 12_000, minBilledKg: 5 }],
    }, world.agentId)
    fresh(app, em)

    const shipment = await em.findOneOrFail(ExportShipment, { id: created.shipment.id })
    expect(Number(shipment.pricePerKg)).toBe(8500)
    expect(Number(shipment.shippingPrice)).toBe(42_500)
  })

  it('carte : colis en attente jusqu\'à la confirmation, puis PAYÉ et compte EXPORT crédité une seule fois', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const world = await seedTerroirWorld(app, em)
    fakeCardGateway(app)

    const created = await app.get(TerroirCheckoutService).create(world.buyerId, terroirCart([
      { productId: world.shopA.productIds[0], quantity: 1 },
      { productId: world.shopB.productIds[0], quantity: 1 },
    ], { departureId: world.departureId, paymentMethod: 'FEDAPAY', insured: true }))
    // Opened by the app through the existing cart flow, never by the checkout itself.
    expect(created.paymentUrl).toBeNull()
    expect(created.shipment.status).toBe(ExportShipmentStatus.PENDING_PAYMENT)
    const payments = app.get(PaymentsService)
    const opened = await payments.initiateCartPayment(world.buyerId, { checkoutId: created.checkout.id })
    expect(opened.paymentUrl).toBe('https://pay.example/terroir')
    expect(opened.amount).toBe(49_500)
    fresh(app, em)

    const pending = await em.findOneOrFail(Checkout, { id: created.checkout.id })
    // 6 000 of products, 42 500 of shipping, insurance at its 1 000 floor.
    expect(Number(pending.totalAmount)).toBe(49_500)
    expect(await exportMovements(em)).toEqual([])

    await payments.verifyCartPayment(world.buyerId, { checkoutId: pending.id, fedapayTransactionId: pending.providerTransactionId! })
    await payments.verifyCartPayment(world.buyerId, { checkoutId: pending.id, fedapayTransactionId: pending.providerTransactionId! })
    fresh(app, em)

    const shipment = await em.findOneOrFail(ExportShipment, { id: created.shipment.id })
    expect(shipment.status).toBe(ExportShipmentStatus.PAID)
    const escrowed = await em.find(Payment, { checkout: pending.id })
    expect(escrowed.reduce((total, payment) => total + Number(payment.amount), 0)).toBe(6000)
    expect(await exportMovements(em)).toEqual([
      { type: 'EXPORT_SHIPPING_INCOME', amount: 42_500 },
      { type: 'EXPORT_INSURANCE_INCOME', amount: 1000 },
    ])
  })

  it('pack eBio vendu sous ses lignes : boutiques payées au prix plein, compensation portée par EXPORT', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const world = await seedTerroirWorld(app, em, { balance: 100_000 })
    const pack = await app.get(ExportCatalogService).createPack(null, {
      name: 'Pack découverte',
      photos: [],
      price: 5000,
      items: [
        { productId: world.shopA.productIds[0], quantity: 1 },
        { productId: world.shopB.productIds[1], quantity: 1 },
      ],
    }, world.agentId)

    const created = await app.get(TerroirCheckoutService).create(world.buyerId, terroirCart([
      { packId: pack.pack.id, quantity: 1 },
    ], { departureId: world.departureId }))
    fresh(app, em)

    const checkout = await em.findOneOrFail(Checkout, { id: created.checkout.id })
    expect(Number(checkout.itemsTotal)).toBe(5000)
    expect(Number(checkout.totalAmount)).toBe(47_500)
    const orders = await em.find(Order, { checkout: checkout.id })
    expect(orders.map(order => Number(order.totalAmount)).sort()).toEqual([2500, 3000])
    expect(orders.every(order => order.exportPackId === pack.pack.id)).toBe(true)
    expect(await exportMovements(em)).toEqual([
      { type: 'EXPORT_SHIPPING_INCOME', amount: 42_500 },
      { type: 'EXPORT_PACK_COMPENSATION', amount: -500 },
    ])
  })

  it('refuse un produit qui n\'est pas exportable', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const world = await seedTerroirWorld(app, em, { balance: 100_000 })
    await app.get(ExportCatalogService).removeProfile(world.shopA.supplierId, world.shopA.productIds[0])

    expect(await refusalOf(app.get(TerroirCheckoutService).create(world.buyerId, terroirCart([
      { productId: world.shopA.productIds[0], quantity: 1 },
    ], { departureId: world.departureId })))).toEqual({ status: 409, code: 'TERROIR_LINE_UNAVAILABLE' })
  })
})
