import type { INestApplication } from '@nestjs/common'
import { EntityManager } from '@mikro-orm/postgresql'
import { beforeEach, describe, expect, it } from 'vitest'
import { createUserData } from '../../../factories/user.factory'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { ProductsModule } from '../../products/products.module'
import { ProductsService } from '../../products/products.service'
import { PlatformSettingsService } from '../../settings/platform-settings.service'
import { ExportPackStatus, ExportProfileStatus } from '../contracts/terroir.contract'
import { ExportCatalogService } from '../export-catalog.service'
import { TerroirMapper } from '../terroir.mapper'
import { TerroirModule } from '../terroir.module'
import { muteOutbound, completeExportProfile as profileInput, refusalOf, seedShop } from './terroir.fixture'

const THRESHOLDS = { minShelfLifeDays: 90, maxUnitWeightG: 5000 }

function fresh(app: INestApplication): void {
  app.get(EntityManager).clear()
}

/**
 * US3: a shop offers a product for export; it is exportable as soon as it
 * meets every criterion, with no review. Packs only hold products offered for
 * export and stop being orderable as soon as one no longer is exportable.
 */
describe('terroir, produits exportables et packs (e2e)', { timeout: 30_000 }, () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 4 }, {
      imports: [RolesModule, AuditModule, ProductsModule, TerroirModule],
    })
    muteOutbound(app)
    context.app = app
    context.em = orm.em.fork()
  })

  it('une catégorie interdite s\'enregistre mais reste incomplète, critère « catégorie » non rempli', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const shop = await seedShop(em)
    await app.get(PlatformSettingsService).setTerroirExportSettings({ bannedCategoryIds: [shop.categoryId] })

    const profile = await app.get(ExportCatalogService).upsertProfile(shop.supplierId, shop.productIds[0], profileInput())
    const response = TerroirMapper.toProfile(profile, THRESHOLDS)
    expect(response.status).toBe(ExportProfileStatus.INCOMPLETE)
    expect(response.missingCount).toBe(1)
    expect(response.criteria.find(criterion => criterion.key === 'category_allowed')).toMatchObject({ met: false, label: 'Catégorie autorisée à l’export' })
  })

  it('exportable dès l\'enregistrement, la boutique prévenue une seule fois, badge avec l\'origine', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const shop = await seedShop(em)
    const catalog = app.get(ExportCatalogService)
    const [karite] = shop.productIds

    await catalog.upsertProfile(shop.supplierId, karite, profileInput())
    fresh(app)
    const saved = await catalog.getProfile(shop.supplierId, karite)
    expect(saved?.status).toBe(ExportProfileStatus.EXPORTABLE)
    expect(saved?.exportableSince).toBeInstanceOf(Date)
    const response = TerroirMapper.toProfile(saved!, THRESHOLDS)
    expect(response).toMatchObject({ missingCount: 0, withdrawnReason: null, badge: true })
    expect(response.criteria.every(criterion => criterion.met)).toBe(true)

    // Saved again: no second message.
    await catalog.upsertProfile(shop.supplierId, karite, profileInput({ packedWeightG: 320 }))
    const notices = await em.getConnection().execute(
      `SELECT type, body FROM notifications WHERE "userId" = ?`,
      [shop.shopUserId],
    ) as Array<{ type: string, body: string }>
    expect(notices).toHaveLength(1)
    expect(notices[0].type).toBe('EXPORT_PRODUCT_REVIEWED')
    expect(notices[0].body).toContain('remplit tous les critères d’export')
  })

  it('la fiche produit compte : ingrédients effacés, incomplet ; le prix n\'y change rien', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const shop = await seedShop(em)
    const catalog = app.get(ExportCatalogService)
    const [karite] = shop.productIds
    await catalog.upsertProfile(shop.supplierId, karite, profileInput())

    await app.get(ProductsService).update(karite, shop.supplierId, { pricePerUnit: 3200 })
    fresh(app)
    expect((await catalog.getProfile(shop.supplierId, karite))?.status).toBe(ExportProfileStatus.EXPORTABLE)

    await app.get(ProductsService).update(karite, shop.supplierId, { ingredients: '' })
    fresh(app)
    const emptied = await catalog.getProfile(shop.supplierId, karite)
    expect(emptied?.status).toBe(ExportProfileStatus.INCOMPLETE)
    expect(emptied?.missingCriteria).toEqual(['ingredients'])

    await app.get(ProductsService).update(karite, shop.supplierId, { ingredients: 'Beurre de karité' })
    fresh(app)
    expect((await catalog.getProfile(shop.supplierId, karite))?.status).toBe(ExportProfileStatus.EXPORTABLE)
  })

  it('refuse dans un pack boutique le produit d\'une autre boutique', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fatou = await seedShop(em, 'Karité Fatou')
    const koffi = await seedShop(em, 'Moringa Koffi')
    const catalog = app.get(ExportCatalogService)
    await catalog.upsertProfile(fatou.supplierId, fatou.productIds[0], profileInput())
    await catalog.upsertProfile(koffi.supplierId, koffi.productIds[1], profileInput())

    expect(await refusalOf(catalog.createPack(fatou.supplierId, {
      name: 'Pack beauté',
      photos: [],
      price: 5000,
      items: [{ productId: fatou.productIds[0], quantity: 1 }, { productId: koffi.productIds[1], quantity: 1 }],
    }, fatou.shopUserId))).toEqual({ status: 400, code: 'EXPORT_PACK_FOREIGN_PRODUCT' })

    // A product that never asked for export cannot be packed either.
    expect(await refusalOf(catalog.createPack(fatou.supplierId, {
      name: 'Pack gari',
      photos: [],
      price: 3000,
      items: [{ productId: fatou.productIds[2], quantity: 2 }],
    }, fatou.shopUserId))).toEqual({ status: 400, code: 'EXPORT_PACK_NOT_EXPORTABLE' })

    const own = await catalog.createPack(fatou.supplierId, {
      name: 'Pack karité',
      photos: [],
      price: 5500,
      items: [{ productId: fatou.productIds[0], quantity: 2 }],
    }, fatou.shopUserId)
    // No photo yet: incomplete, not orderable.
    expect(own.pack.status).toBe(ExportPackStatus.INCOMPLETE)
    expect(TerroirMapper.toPack(own).criteria.find(criterion => criterion.key === 'photo')?.met).toBe(false)
    expect(own.orderable).toBe(false)
  })

  it('rend un pack eBio incommandable dès qu\'un de ses produits n\'est plus exportable', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fatou = await seedShop(em, 'Karité Fatou')
    const koffi = await seedShop(em, 'Moringa Koffi')
    const agent = await createUserData(em)
    const catalog = app.get(ExportCatalogService)
    for (const [shop, productId] of [[fatou, fatou.productIds[0]], [koffi, koffi.productIds[1]]] as const) {
      await catalog.upsertProfile(shop.supplierId, productId, profileInput())
    }

    const created = await catalog.createPack(null, {
      name: 'Coffret du Bénin',
      description: 'Karité et moringa, de deux coopératives',
      photos: ['https://media.ebio.app/products/coffret.jpg'],
      price: 7500,
      items: [{ productId: fatou.productIds[0], quantity: 2 }, { productId: koffi.productIds[1], quantity: 1 }],
    }, agent.id)
    const view = TerroirMapper.toPack(created)

    expect(view.supplierId).toBeNull()
    expect(view.status).toBe('EXPORTABLE')
    expect(view.orderable).toBe(true)
    // 2 × 3 000 + 2 500 = 8 500 at the shops' prices: eBio pays 1 000 on top.
    expect(view.linesTotal).toBe(8500)
    expect(view.difference).toBe(-1000)
    expect(new Set(view.items.map(item => item.shopName))).toEqual(new Set(['Karité Fatou', 'Moringa Koffi']))

    await app.get(ProductsService).update(koffi.productIds[1], koffi.supplierId, { ingredients: '' })
    fresh(app)
    const after = await catalog.getPack(created.pack.id)
    expect(after.pack.status).toBe(ExportPackStatus.INCOMPLETE)
    expect(after.orderable).toBe(false)
  })
})
