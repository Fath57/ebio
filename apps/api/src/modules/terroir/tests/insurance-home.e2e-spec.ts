import type { INestApplication } from '@nestjs/common'
import { EntityManager } from '@mikro-orm/postgresql'
import { beforeEach, describe, expect, it } from 'vitest'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { Order } from '../../orders/entities/order.entity'
import { OrdersService } from '../../orders/orders.service'
import { Checkout } from '../../payments/entities/checkout.entity'
import { ExportCountry, ExportReception, ExportShipmentStatus } from '../contracts/terroir.contract'
import { ExportShipment } from '../entities/export-shipment.entity'
import { ExportShipmentsService } from '../export-shipments.service'
import { TerroirCheckoutService } from '../terroir-checkout.service'
import { TerroirModule } from '../terroir.module'
import { balanceOfShop, balanceOfUser, exportMovements, seedTerroirWorld, terroirCart } from './terroir-checkout.fixture'
import { refusalOf } from './terroir.fixture'

/**
 * T056 (US6): door delivery only where the departure offers it; insurance at
 * its rate with a floor, booked apart on the EXPORT account; an insured
 * parcel lost is refunded in full, door delivery included, the shop never
 * debited.
 */
describe('terroir, domicile et assurance (e2e)', { timeout: 30_000 }, () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 6 }, {
      imports: [RolesModule, AuditModule, TerroirModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('refuse la livraison à domicile quand le départ ne la propose pas dans le pays', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const world = await seedTerroirWorld(app, em, { balance: 200_000 })
    const service = app.get(TerroirCheckoutService)
    const cart = terroirCart([{ productId: world.shopA.productIds[0], quantity: 1 }], {
      country: ExportCountry.BE,
      departureId: world.departureId,
      reception: ExportReception.HOME,
      homeAddress: '4 avenue Louise, 1050 Bruxelles',
    })

    const quote = await service.preview(world.buyerId, cart)
    expect(quote.homeDeliveryQuote).toBeNull()
    expect(quote.homeDeliveryFee).toBe(0)
    expect(await refusalOf(service.create(world.buyerId, cart))).toEqual({ status: 400, code: 'HOME_DELIVERY_UNAVAILABLE' })
  })

  it('livraison à domicile en France : supplément du départ ajouté au total et au compte EXPORT', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const world = await seedTerroirWorld(app, em, { balance: 200_000 })

    const created = await app.get(TerroirCheckoutService).create(world.buyerId, terroirCart([{ productId: world.shopA.productIds[0], quantity: 1 }], {
      departureId: world.departureId,
      reception: ExportReception.HOME,
      homeAddress: '8 rue des Poissonniers, 75018 Paris',
    }))
    em.clear()

    const shipment = await em.findOneOrFail(ExportShipment, { id: created.shipment.id })
    expect(Number(shipment.homeDeliveryFee)).toBe(3900)
    expect(shipment.pickupPoint).toBeNull()
    expect(shipment.homeAddress).toBe('8 rue des Poissonniers, 75018 Paris')
    const checkout = await em.findOneOrFail(Checkout, { id: created.checkout.id })
    expect(Number(checkout.totalAmount)).toBe(3000 + 42_500 + 3900)
    expect(await exportMovements(em)).toEqual([{ type: 'EXPORT_SHIPPING_INCOME', amount: 46_400 }])
  })

  it('assurance : 3 % de la valeur, au moins 1 000 FCFA, suivie à part', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const world = await seedTerroirWorld(app, em, { balance: 500_000 })
    const service = app.get(TerroirCheckoutService)

    const small = await service.preview(world.buyerId, terroirCart([{ productId: world.shopA.productIds[0], quantity: 1 }], { insured: true }))
    expect(small.insurancePrice).toBe(1000)

    // 20 × 3 000 = 60 000 of products → 1 800 of insurance.
    const created = await service.create(world.buyerId, terroirCart([{ productId: world.shopA.productIds[0], quantity: 20 }], { departureId: world.departureId, insured: true }))
    em.clear()

    const shipment = await em.findOneOrFail(ExportShipment, { id: created.shipment.id })
    expect(shipment.insured).toBe(true)
    expect(Number(shipment.insurancePrice)).toBe(1800)
    expect(Number(shipment.declaredValue)).toBe(60_000)
    const movements = await exportMovements(em)
    expect(movements.filter(movement => movement.type === 'EXPORT_INSURANCE_INCOME')).toEqual([{ type: 'EXPORT_INSURANCE_INCOME', amount: 1800 }])
  })

  it('colis assuré perdu : remboursé intégralement (produits, transport, domicile), boutique non débitée', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const world = await seedTerroirWorld(app, em, { balance: 200_000 })
    const created = await app.get(TerroirCheckoutService).create(world.buyerId, terroirCart([{ productId: world.shopA.productIds[0], quantity: 1 }], {
      departureId: world.departureId,
      insured: true,
      reception: ExportReception.HOME,
      homeAddress: '8 rue des Poissonniers, 75018 Paris',
    }))
    app.get(EntityManager).clear()
    em.clear()
    const [order] = await em.find(Order, { checkout: created.checkout.id })
    await app.get(OrdersService).accept(order.id, world.shopA.supplierId)
    const shipments = app.get(ExportShipmentsService)
    await shipments.collect(created.shipment.id, world.shopA.supplierId, world.agentId)
    await shipments.addEvent(created.shipment.id, { step: ExportShipmentStatus.DEPARTED }, world.agentId)
    const shop = await balanceOfShop(em, world.shopA.supplierId)
    const buyer = await balanceOfUser(em, world.buyerId)

    await shipments.lost(created.shipment.id, false, world.agentId)

    expect(await balanceOfUser(em, world.buyerId)).toBe(buyer + 3000 + 42_500 + 3900)
    expect(await balanceOfShop(em, world.shopA.supplierId)).toBe(shop)
    const movements = await exportMovements(em)
    expect(movements.filter(movement => movement.type === 'EXPORT_INSURANCE_INCOME')).toEqual([{ type: 'EXPORT_INSURANCE_INCOME', amount: 1000 }])
    expect(movements.filter(movement => movement.type === 'EXPORT_LOSS')).toEqual([{ type: 'EXPORT_LOSS', amount: -49_400 }])
  })
})
