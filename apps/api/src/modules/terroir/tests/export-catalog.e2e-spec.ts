import type { INestApplication } from '@nestjs/common'
import type { ExportProfileInput } from '../contracts/terroir.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { beforeEach, describe, expect, it } from 'vitest'
import { createUserData } from '../../../factories/user.factory'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { ProductsModule } from '../../products/products.module'
import { ProductsService } from '../../products/products.service'
import { PlatformSettingsService } from '../../settings/platform-settings.service'
import { EXPORT_CHECKLIST_KEYS, ExportPackStatus, ExportProfileStatus } from '../contracts/terroir.contract'
import { ExportCatalogService } from '../export-catalog.service'
import { TerroirMapper } from '../terroir.mapper'
import { TerroirModule } from '../terroir.module'
import { muteOutbound, refusalOf, seedShop } from './terroir.fixture'

const FULL_CHECKLIST = Object.fromEntries(EXPORT_CHECKLIST_KEYS.map(key => [key, true]))

function profileInput(overrides: Partial<ExportProfileInput> = {}): ExportProfileInput {
  return {
    packedWeightG: 280,
    lengthCm: 10,
    widthCm: 8,
    heightCm: 6,
    shelfLifeDays: 365,
    origin: { producer: 'Coopérative des femmes de Savè', place: 'Savè, Collines', year: 2026, method: 'Barattage à la main', photos: [] },
    labelPhoto: 'https://media.ebio.app/products/etiquette.jpg',
    ...overrides,
  }
}

function fresh(app: INestApplication): void {
  app.get(EntityManager).clear()
}

/**
 * US3: a shop asks to export a product, eBio checks it against the list
 * before it is seen abroad; packs only hold approved products and stop being
 * orderable as soon as one is no longer approved.
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

  it('refuse d\'emblée une catégorie interdite à l\'export', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const shop = await seedShop(em)
    await app.get(PlatformSettingsService).setTerroirExportSettings({ bannedCategoryIds: [shop.categoryId] })

    expect(await refusalOf(app.get(ExportCatalogService).upsertProfile(shop.supplierId, shop.productIds[0], profileInput())))
      .toEqual({ status: 400, code: 'EXPORT_CATEGORY_BANNED' })
  })

  it('ne valide qu\'avec toute la liste de contrôle et la photo d\'étiquette, et garde l\'agent', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const shop = await seedShop(em)
    const agent = await createUserData(em, { name: 'Agent eBio' })
    const catalog = app.get(ExportCatalogService)
    const [karite, moringa] = shop.productIds
    await catalog.upsertProfile(shop.supplierId, karite, profileInput())
    await catalog.upsertProfile(shop.supplierId, moringa, profileInput({ labelPhoto: null }))

    expect(await refusalOf(catalog.review(karite, { decision: 'APPROVE', checklist: { ...FULL_CHECKLIST, dates_present: false } }, agent.id)))
      .toEqual({ status: 400, code: 'EXPORT_CHECKLIST_INCOMPLETE' })
    expect(await refusalOf(catalog.review(moringa, { decision: 'APPROVE', checklist: FULL_CHECKLIST }, agent.id)))
      .toEqual({ status: 400, code: 'EXPORT_LABEL_PHOTO_REQUIRED' })
    expect(await refusalOf(catalog.review(moringa, { decision: 'REJECT', checklist: {} }, agent.id)))
      .toEqual({ status: 400, code: 'EXPORT_REASON_REQUIRED' })

    await catalog.review(karite, { decision: 'APPROVE', checklist: FULL_CHECKLIST }, agent.id)
    fresh(app)
    const approved = await catalog.getProfile(shop.supplierId, karite)

    expect(approved?.status).toBe(ExportProfileStatus.APPROVED)
    expect(approved?.reviewedBy?.id).toBe(agent.id)
    expect(approved?.reviewedAt).toBeInstanceOf(Date)
    expect(approved?.checklist).toEqual(FULL_CHECKLIST)
    expect(TerroirMapper.toProfile(approved!).badge).toBe(true)

    const [notice] = await em.getConnection().execute(
      `SELECT type, body FROM notifications WHERE "userId" = ?`,
      [shop.shopUserId],
    ) as Array<{ type: string, body: string }>
    expect(notice.type).toBe('EXPORT_PRODUCT_REVIEWED')
    expect(notice.body).toContain('validé pour l\'export')
  })

  it('renvoie en validation un produit dont le poids, la composition ou l\'étiquette change', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const shop = await seedShop(em)
    const agent = await createUserData(em)
    const catalog = app.get(ExportCatalogService)
    const [karite] = shop.productIds
    await catalog.upsertProfile(shop.supplierId, karite, profileInput())
    await catalog.review(karite, { decision: 'APPROVE', checklist: FULL_CHECKLIST }, agent.id)

    // Saved again unchanged: the approval stands.
    await catalog.upsertProfile(shop.supplierId, karite, profileInput())
    fresh(app)
    expect((await catalog.getProfile(shop.supplierId, karite))?.status).toBe(ExportProfileStatus.APPROVED)

    await catalog.upsertProfile(shop.supplierId, karite, profileInput({ packedWeightG: 320 }))
    fresh(app)
    expect((await catalog.getProfile(shop.supplierId, karite))?.status).toBe(ExportProfileStatus.PENDING)

    await catalog.review(karite, { decision: 'APPROVE', checklist: FULL_CHECKLIST }, agent.id)
    // A price change is no business of the checklist…
    await app.get(ProductsService).update(karite, shop.supplierId, { pricePerUnit: 3200 })
    fresh(app)
    expect((await catalog.getProfile(shop.supplierId, karite))?.status).toBe(ExportProfileStatus.APPROVED)
    // …the composition is.
    await app.get(ProductsService).update(karite, shop.supplierId, { ingredients: 'Beurre de karité, huile de palme' })
    fresh(app)
    expect((await catalog.getProfile(shop.supplierId, karite))?.status).toBe(ExportProfileStatus.PENDING)
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
    expect(own.pack.status).toBe(ExportPackStatus.PENDING)
    expect(own.orderable).toBe(false)
  })

  it('rend un pack eBio incommandable dès qu\'un de ses produits n\'est plus validé', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fatou = await seedShop(em, 'Karité Fatou')
    const koffi = await seedShop(em, 'Moringa Koffi')
    const agent = await createUserData(em)
    const catalog = app.get(ExportCatalogService)
    for (const [shop, productId] of [[fatou, fatou.productIds[0]], [koffi, koffi.productIds[1]]] as const) {
      await catalog.upsertProfile(shop.supplierId, productId, profileInput())
      await catalog.review(productId, { decision: 'APPROVE', checklist: FULL_CHECKLIST }, agent.id)
    }

    const created = await catalog.createPack(null, {
      name: 'Coffret du Bénin',
      description: 'Karité et moringa, de deux coopératives',
      photos: [],
      price: 7500,
      items: [{ productId: fatou.productIds[0], quantity: 2 }, { productId: koffi.productIds[1], quantity: 1 }],
    }, agent.id)
    const view = TerroirMapper.toPack(created)

    expect(view.supplierId).toBeNull()
    expect(view.status).toBe('APPROVED')
    expect(view.orderable).toBe(true)
    // 2 × 3 000 + 2 500 = 8 500 at the shops' prices: eBio pays 1 000 on top.
    expect(view.linesTotal).toBe(8500)
    expect(view.difference).toBe(-1000)
    expect(new Set(view.items.map(item => item.shopName))).toEqual(new Set(['Karité Fatou', 'Moringa Koffi']))

    await app.get(ProductsService).update(koffi.productIds[1], koffi.supplierId, { allergens: ['SESAME'] as never })
    fresh(app)
    expect((await catalog.getPack(created.pack.id)).orderable).toBe(false)
  })
})
