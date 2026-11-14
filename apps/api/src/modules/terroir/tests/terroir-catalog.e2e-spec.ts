import type { INestApplication } from '@nestjs/common'
import { EntityManager } from '@mikro-orm/postgresql'
import { beforeEach, describe, expect, it } from 'vitest'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { ProductsController } from '../../products/products.controller'
import { ProductsService } from '../../products/products.service'
import { ExportCountry } from '../contracts/terroir.contract'
import { ExportCatalogService } from '../export-catalog.service'
import { ExportLogisticsService } from '../export-logistics.service'
import { TerroirMapper } from '../terroir.mapper'
import { TerroirModule } from '../terroir.module'
import { seedTerroirWorld } from './terroir-checkout.fixture'
import { refusalOf } from './terroir.fixture'

/** T024: buyers abroad see approved products and orderable packs only, and the departures towards them. */
describe('terroir, catalogue et départs côté client (e2e)', { timeout: 30_000 }, () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 6 }, {
      imports: [RolesModule, AuditModule, TerroirModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('n\'affiche que les produits validés et les packs commandables, avec badge et poids', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const world = await seedTerroirWorld(app, em)
    const catalog = app.get(ExportCatalogService)
    const pack = await catalog.createPack(null, { name: 'Pack découverte', photos: [], price: 5000, items: [{ productId: world.shopA.productIds[0], quantity: 2 }] }, world.agentId)
    await catalog.createPack(null, { name: 'Pack moringa', photos: [], price: 2000, items: [{ productId: world.shopB.productIds[1], quantity: 1 }] }, world.agentId)
    await catalog.removeProfile(world.shopB.supplierId, world.shopB.productIds[1])
    em.clear()
    app.get(EntityManager).clear()

    const response = TerroirMapper.toCatalog(await catalog.clientCatalog({ page: 1 }), ExportCountry.FR, 1, 'EUR', 655.957)
    expect(response.products.map(product => product.id)).not.toContain(world.shopB.productIds[1])
    expect(response.products).toHaveLength(5)
    expect(response.products.every(product => product.badge)).toBe(true)
    expect(response.products.find(product => product.id === world.shopA.productIds[0])).toMatchObject({ price: 3000, displayPrice: 4.58, weightG: 280 })
    expect(response.packs).toEqual([expect.objectContaining({ id: pack.pack.id, weightG: 560, itemCount: 2 })])

    expect(await refusalOf(catalog.clientProduct(world.shopB.productIds[1]))).toEqual({ status: 404, code: 'TERROIR_PRODUCT_NOT_FOUND' })
    const detail = TerroirMapper.toClientProduct(await catalog.clientProduct(world.shopA.productIds[0]), 'XOF', null)
    expect(detail).toMatchObject({ weightG: 280, badge: true, displayPrice: null, origin: { producer: 'Coopérative de Savè' } })
  })

  it('départs : le plus proche en tête, prix du transport pour le poids, points de retrait, date de collecte', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const world = await seedTerroirWorld(app, em)
    const logistics = app.get(ExportLogisticsService)

    const { offers, departures } = await logistics.offerableDepartures(ExportCountry.FR, 6200)
    const points = await logistics.pickupPointsFor(offers, departures, ExportCountry.FR)
    const response = TerroirMapper.toDepartures(offers, departures, points, null, 'XOF', await logistics.hasPendingAlert(world.buyerId, ExportCountry.FR))

    expect(response.next).toMatchObject({ departureId: world.departureId, agency: 'Bénin Express', city: 'Paris' })
    expect(response.alertSubscribed).toBe(false)
    expect(response.items[0]).toMatchObject({ shippingPrice: 52_700, homeDeliveryFee: 3900, dutiesIncluded: true, display: null })
    expect(response.items[0].pickupPoints).toEqual([expect.objectContaining({ id: world.parisId, city: 'Paris' })])
    expect(response.items[0].collectBefore).toBe(departures.get(world.departureId)!.depositDeadline.toISOString())
  })

  it('la fiche produit et la liste de la boutique portent l\'état d\'export pour la seule boutique', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const world = await seedTerroirWorld(app, em)
    const [row] = await em.getConnection().execute(`SELECT user_id FROM suppliers WHERE id = ?`, [world.shopA.supplierId]) as Array<{ user_id: string }>
    const controller = app.get(ProductsController)

    const asOwner = await controller.findById({ user: { id: row.user_id } } as never, world.shopA.productIds[0]) as Record<string, unknown>
    expect(asOwner.exportProfile).toMatchObject({ status: 'APPROVED', packedWeightG: 280, rejectionReason: null })
    const asBuyer = await controller.findById({ user: { id: world.buyerId } } as never, world.shopA.productIds[0]) as Record<string, unknown>
    expect(asBuyer).not.toHaveProperty('exportProfile')

    const statuses = await app.get(ProductsService).exportStatusesOf(world.shopA.productIds)
    expect([...statuses.values()]).toEqual(['APPROVED', 'APPROVED', 'APPROVED'])
  })
})
