import type { INestApplication } from '@nestjs/common'
import type { ExportProfileInput } from '../contracts/terroir.contract'
import { MikroORM } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { beforeEach, describe, expect, it } from 'vitest'
import { createUserData } from '../../../factories/user.factory'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { Migration20261121090000 } from '../../db/migrations/Migration20261121090000'
import { ProductsModule } from '../../products/products.module'
import { PlatformSettingsService } from '../../settings/platform-settings.service'
import { AdminExportController } from '../admin-export.controller'
import { ExportabilityStatus, ExportPackStatus, ExportProfileStatus, ExportStorage } from '../contracts/terroir.contract'
import { ExportCatalogService } from '../export-catalog.service'
import { ExportCriteriaService } from '../export-criteria.service'
import { ExportabilityService } from '../exportability.service'
import { TerroirMapper } from '../terroir.mapper'
import { TerroirModule } from '../terroir.module'
import { completeExportProfile, muteOutbound, refusalOf, seedShop } from './terroir.fixture'

interface Context { em: EntityManager, app: INestApplication }

const THRESHOLDS = { minShelfLifeDays: 90, maxUnitWeightG: 5000 }

function fresh({ app, em }: Context): void {
  app.get(EntityManager).clear()
  em.clear()
}

function sessionOf(userId: string): never {
  return { user: { id: userId } } as never
}

/**
 * Automatic export validation: a product meeting every criterion is
 * exportable at once, the shop sees live what is missing, eBio only withdraws
 * and reinstates. Packs follow their products.
 */
describe('terroir, validation d\'export automatique (e2e)', { timeout: 60_000 }, () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 4 }, {
      imports: [RolesModule, AuditModule, ProductsModule, TerroirModule],
    })
    muteOutbound(app)
    context.app = app
    context.em = orm.em.fork()
  })

  it('un profil complet est exportable tout de suite, sans validation', async (context) => {
    const ctx = context as unknown as Context
    const shop = await seedShop(ctx.em)
    const profile = await ctx.app.get(ExportCatalogService).upsertProfile(shop.supplierId, shop.productIds[0], completeExportProfile())

    const response = TerroirMapper.toProfile(profile, THRESHOLDS)
    expect(response.status).toBe(ExportProfileStatus.EXPORTABLE)
    expect(response.missingCount).toBe(0)
    expect(response.criteria).toHaveLength(11)
    expect(response.criteria.find(criterion => criterion.key === 'label_photo')).toEqual({
      key: 'label_photo',
      label: 'Photo de l’étiquette',
      met: true,
      hint: 'Ajoutez une photo nette de l’étiquette, face avant et dates visibles.',
    })
    const [buyerView] = await ctx.app.get(ExportabilityService).ofProducts([shop.productIds[0]])
    expect(buyerView.status).toBe(ExportabilityStatus.EXPORTABLE)
  })

  it('chaque critère manquant garde le produit incomplet, ce critère seul non rempli', async (context) => {
    const ctx = context as unknown as Context
    const shop = await seedShop(ctx.em)
    const catalog = ctx.app.get(ExportCatalogService)
    const [productId] = shop.productIds
    const cases: Array<[string, Partial<ExportProfileInput>]> = [
      ['shelf_life', { shelfLifeDays: 30 }],
      ['shelf_life', { shelfLifeDays: null }],
      ['storage_ambient', { storage: null }],
      ['packed_weight', { packedWeightG: null }],
      ['packed_weight', { packedWeightG: 6000 }],
      ['allergens', { noAllergens: false, allergens: null }],
      ['origin', { origin: { producer: 'Coopérative de Savè', photos: [] } }],
      ['label_photo', { labelPhoto: null }],
      ['french_label', { declaresFrenchLabel: false }],
      ['dates_printed', { declaresDatesPrinted: false }],
      ['sealed_packaging', { declaresSealedPackaging: false }],
    ]
    for (const [key, override] of cases) {
      const profile = await catalog.upsertProfile(shop.supplierId, productId, completeExportProfile(override))
      expect({ key, status: profile.status, missing: profile.missingCriteria }).toEqual({ key, status: ExportProfileStatus.INCOMPLETE, missing: [key] })
    }

    // Allergens: as printed on the label, or ticked on the product sheet, both count.
    expect((await catalog.upsertProfile(shop.supplierId, productId, completeExportProfile({ noAllergens: false, allergens: 'lait' }))).status).toBe(ExportProfileStatus.EXPORTABLE)
    await ctx.em.getConnection().execute(`UPDATE products SET allergens = '["SESAME"]'::jsonb WHERE id = ?`, [productId])
    fresh(ctx)
    expect((await catalog.upsertProfile(shop.supplierId, productId, completeExportProfile({ noAllergens: false, allergens: null }))).status).toBe(ExportProfileStatus.EXPORTABLE)

    // Ingredients come from the product sheet.
    await ctx.em.getConnection().execute(`UPDATE products SET ingredients = NULL WHERE id = ?`, [productId])
    fresh(ctx)
    expect((await catalog.upsertProfile(shop.supplierId, productId, completeExportProfile())).missingCriteria).toEqual(['ingredients'])

    // A banned category: the settings change recomputes the saved profile.
    const other = shop.productIds[1]
    await catalog.upsertProfile(shop.supplierId, other, completeExportProfile())
    await ctx.app.get(PlatformSettingsService).setTerroirExportSettings({ bannedCategoryIds: [shop.categoryId] })
    fresh(ctx)
    const banned = await catalog.getProfile(shop.supplierId, other)
    expect(banned?.status).toBe(ExportProfileStatus.INCOMPLETE)
    expect(banned?.missingCriteria).toEqual(['category_allowed'])
  })

  it('un produit à garder au frais ou surgelé n\'est jamais exportable', async (context) => {
    const ctx = context as unknown as Context
    const shop = await seedShop(ctx.em)
    const catalog = ctx.app.get(ExportCatalogService)
    for (const storage of [ExportStorage.COOL, ExportStorage.FROZEN]) {
      const profile = await catalog.upsertProfile(shop.supplierId, shop.productIds[0], completeExportProfile({ storage }))
      expect(profile.status).toBe(ExportProfileStatus.INCOMPLETE)
      expect(profile.missingCriteria).toEqual(['storage_ambient'])
    }
  })

  it('relever la conservation minimale rend incomplet un produit de 100 jours', async (context) => {
    const ctx = context as unknown as Context
    const shop = await seedShop(ctx.em)
    const catalog = ctx.app.get(ExportCatalogService)
    const settings = ctx.app.get(PlatformSettingsService)
    const [productId] = shop.productIds
    await catalog.upsertProfile(shop.supplierId, productId, completeExportProfile({ shelfLifeDays: 100 }))
    fresh(ctx)
    expect((await catalog.getProfile(shop.supplierId, productId))?.status).toBe(ExportProfileStatus.EXPORTABLE)

    const raised = await settings.setTerroirExportSettings({ minShelfLifeDays: 120 })
    expect(raised).toMatchObject({ minShelfLifeDays: 120, maxUnitWeightG: 5000 })
    fresh(ctx)
    const after = await catalog.getProfile(shop.supplierId, productId)
    expect(after?.status).toBe(ExportProfileStatus.INCOMPLETE)
    const criterion = TerroirMapper.toProfile(after!, { minShelfLifeDays: 120, maxUnitWeightG: 5000 }).criteria.find(item => item.key === 'shelf_life')
    expect(criterion).toMatchObject({ met: false, label: 'Conservation d’au moins 120 jours' })

    await settings.setTerroirExportSettings({ minShelfLifeDays: 90 })
    fresh(ctx)
    expect((await catalog.getProfile(shop.supplierId, productId))?.status).toBe(ExportProfileStatus.EXPORTABLE)
    expect(await refusalOf(settings.setTerroirExportSettings({ maxUnitWeightG: 10 }))).toMatchObject({ status: 400 })
  })

  it('retrait par eBio : le client lit « Non exportable », la boutique le motif ; remis : exportable', async (context) => {
    const ctx = context as unknown as Context
    const shop = await seedShop(ctx.em)
    const agent = await createUserData(ctx.em, { name: 'Agent eBio' })
    const catalog = ctx.app.get(ExportCatalogService)
    const admin = ctx.app.get(AdminExportController)
    const [productId] = shop.productIds
    await catalog.upsertProfile(shop.supplierId, productId, completeExportProfile())

    const withdrawn = await admin.withdrawProduct(productId, { reason: 'Étiquette illisible à l’arrivée' }, sessionOf(agent.id))
    expect(withdrawn).toMatchObject({ status: 'WITHDRAWN', withdrawnReason: 'Étiquette illisible à l’arrivée', missingCount: 0, shopName: 'Karité Fatou' })
    expect(await refusalOf(admin.withdrawProduct(productId, { reason: 'Encore' }, sessionOf(agent.id)))).toEqual({ status: 409, code: 'EXPORT_ALREADY_WITHDRAWN' })

    const [buyerView] = await ctx.app.get(ExportabilityService).ofProducts([productId])
    expect(buyerView).toMatchObject({ status: 'REJECTED', label: 'Non exportable', reason: 'Ce produit ne peut pas voyager (contrôle eBio).' })
    expect(JSON.stringify(buyerView)).not.toContain('illisible')

    // Saving again does not lift the withdrawal.
    await catalog.upsertProfile(shop.supplierId, productId, completeExportProfile({ packedWeightG: 300 }))
    fresh(ctx)
    expect((await catalog.getProfile(shop.supplierId, productId))?.status).toBe(ExportProfileStatus.WITHDRAWN)

    const list = await admin.listProducts({ status: ExportProfileStatus.WITHDRAWN, search: 'karité', page: 1 })
    expect(list.data.map(item => item.productId)).toEqual([productId])
    expect(list.counts).toEqual({ EXPORTABLE: 0, INCOMPLETE: 0, WITHDRAWN: 1 })

    const reinstated = await admin.reinstateProduct(productId, sessionOf(agent.id))
    expect(reinstated).toMatchObject({ status: 'EXPORTABLE', withdrawnReason: null })
    expect(await refusalOf(admin.reinstateProduct(productId, sessionOf(agent.id)))).toEqual({ status: 409, code: 'EXPORT_NOT_WITHDRAWN' })
    fresh(ctx)
    const [back] = await ctx.app.get(ExportabilityService).ofProducts([productId])
    expect(back.status).toBe(ExportabilityStatus.EXPORTABLE)

    const notices = await ctx.em.getConnection().execute(
      `SELECT title, body FROM notifications WHERE "userId" = ? ORDER BY "createdAt"`,
      [shop.shopUserId],
    ) as Array<{ title: string, body: string }>
    expect(notices.map(notice => notice.title)).toEqual(['Produit exportable', 'Retiré de l’export', 'De retour à l’export'])
    expect(notices[1].body).toContain('Étiquette illisible à l’arrivée')
    const [audit] = await ctx.em.getConnection().execute(
      `SELECT COUNT(*)::int AS count FROM audit_logs WHERE action IN ('EXPORT_PRODUCT_WITHDRAWN', 'EXPORT_PRODUCT_REINSTATED')`,
    ) as Array<{ count: number }>
    expect(audit.count).toBe(2)
  })

  it('un pack suit ses produits ; eBio peut le retirer et le remettre', async (context) => {
    const ctx = context as unknown as Context
    const shop = await seedShop(ctx.em)
    const agent = await createUserData(ctx.em)
    const catalog = ctx.app.get(ExportCatalogService)
    const admin = ctx.app.get(AdminExportController)
    const [karite, moringa] = shop.productIds
    await catalog.upsertProfile(shop.supplierId, karite, completeExportProfile())
    await catalog.upsertProfile(shop.supplierId, moringa, completeExportProfile({ labelPhoto: null }))

    const created = await catalog.createPack(shop.supplierId, {
      name: 'Pack beauté',
      photos: ['https://media.ebio.app/products/pack.jpg'],
      price: 5000,
      items: [{ productId: karite, quantity: 1 }, { productId: moringa, quantity: 1 }],
    }, shop.shopUserId)
    const incomplete = TerroirMapper.toPack(created)
    expect(incomplete.status).toBe('INCOMPLETE')
    expect(incomplete.criteria.filter(criterion => !criterion.met).map(criterion => criterion.key)).toEqual(['products_exportable'])
    expect(incomplete.criteria.find(criterion => criterion.key === 'products_exportable')?.label).toBe('Tous les produits exportables')

    // The second product completed: the pack follows at once.
    await catalog.upsertProfile(shop.supplierId, moringa, completeExportProfile())
    fresh(ctx)
    const ready = await catalog.getPack(created.pack.id)
    expect(ready.pack.status).toBe(ExportPackStatus.EXPORTABLE)
    expect(ready.orderable).toBe(true)

    // A product withdrawn: the pack is incomplete; reinstated: exportable again.
    await catalog.withdraw(moringa, 'Contrôle douanier', agent.id)
    fresh(ctx)
    expect((await catalog.getPack(created.pack.id)).pack.status).toBe(ExportPackStatus.INCOMPLETE)
    await catalog.reinstate(moringa, agent.id)
    fresh(ctx)
    expect((await catalog.getPack(created.pack.id)).pack.status).toBe(ExportPackStatus.EXPORTABLE)

    const withdrawn = await admin.withdrawPack(created.pack.id, { reason: 'Photo trompeuse' }, sessionOf(agent.id))
    expect(withdrawn).toMatchObject({ status: 'WITHDRAWN', withdrawnReason: 'Photo trompeuse', orderable: false })
    const listed = await admin.listPacks({ scope: 'all', status: ExportPackStatus.WITHDRAWN })
    expect(listed.map(pack => pack.id)).toEqual([created.pack.id])
    expect(await admin.listPacks({ scope: 'ebio' })).toEqual([])
    const reinstated = await admin.reinstatePack(created.pack.id, sessionOf(agent.id))
    expect(reinstated).toMatchObject({ status: 'EXPORTABLE', withdrawnReason: null, orderable: true })
  })

  it('migration : un ancien refus devient un retrait, motif gardé ; une ancienne validation est recalculée', async (context) => {
    const ctx = context as unknown as Context
    const shop = await seedShop(ctx.em)
    const catalog = ctx.app.get(ExportCatalogService)
    const [rejected, approved] = shop.productIds
    await catalog.upsertProfile(shop.supplierId, rejected, completeExportProfile())
    await catalog.upsertProfile(shop.supplierId, approved, completeExportProfile({ declaresFrenchLabel: false, declaresDatesPrinted: false }))
    const db = ctx.em.getConnection()

    // Back to the schema and rows of the manual review.
    await db.execute(`ALTER TABLE export_profiles DROP CONSTRAINT IF EXISTS export_profiles_status_check`)
    await db.execute(`ALTER TABLE export_profiles DROP CONSTRAINT IF EXISTS export_profiles_label_check`)
    await db.execute(`ALTER TABLE export_profiles ADD COLUMN IF NOT EXISTS checklist jsonb NOT NULL DEFAULT '{}'`)
    await db.execute(`ALTER TABLE export_profiles RENAME COLUMN withdrawn_reason TO rejection_reason`)
    await db.execute(`ALTER TABLE export_profiles RENAME COLUMN withdrawn_at TO reviewed_at`)
    await db.execute(`UPDATE export_profiles SET status = 'REJECTED', rejection_reason = 'Étiquette illisible', reviewed_at = NOW() WHERE product_id = ?`, [rejected])
    await db.execute(`UPDATE export_profiles SET status = 'APPROVED', checklist = '{"label_french": true, "dates_present": true}', exportable_since = NULL WHERE product_id = ?`, [approved])

    const orm = ctx.app.get(MikroORM)
    const migration = new Migration20261121090000(orm.em.getDriver() as never, orm.config)
    await migration.up()
    for (const query of migration.getQueries()) {
      await db.execute(String(query))
    }
    const rows = await db.execute(`SELECT product_id, status, withdrawn_reason, declares_french_label, declares_dates_printed, exportable_since FROM export_profiles`) as Array<Record<string, unknown>>
    const byId = new Map(rows.map(row => [row.product_id, row]))
    expect(byId.get(rejected)).toMatchObject({ status: 'WITHDRAWN', withdrawn_reason: 'Étiquette illisible' })
    expect(byId.get(approved)).toMatchObject({ status: 'INCOMPLETE', declares_french_label: true, declares_dates_printed: true })
    expect(byId.get(approved)?.exportable_since).not.toBeNull()

    // The API recomputes at boot: the approved one meets every criterion again.
    await ctx.app.get(ExportCriteriaService).refreshAll()
    fresh(ctx)
    expect((await catalog.getProfile(shop.supplierId, approved))?.status).toBe(ExportProfileStatus.EXPORTABLE)
    expect((await catalog.getProfile(shop.supplierId, rejected))?.withdrawnReason).toBe('Étiquette illisible')
  })
})
