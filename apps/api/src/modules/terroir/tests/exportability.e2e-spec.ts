import type { INestApplication } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { EntityManager } from '@mikro-orm/postgresql'
import { beforeEach, describe, expect, it } from 'vitest'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { ProductsController } from '../../products/products.controller'
import { PlatformSettingsService } from '../../settings/platform-settings.service'
import { ExportCatalogService } from '../export-catalog.service'
import { TerroirClientController } from '../terroir-client.controller'
import { TerroirModule } from '../terroir.module'
import { approveForExport, seedTerroirWorld } from './terroir-checkout.fixture'
import { refusalOf, seedShop } from './terroir.fixture'

interface Context { em: EntityManager, app: INestApplication }

function fresh({ app, em }: Context): void {
  app.get(EntityManager).clear()
  em.clear()
}

/**
 * « Mode Valise »: every product of the catalogue says whether it can go in
 * the suitcase, banned category first, then the export request, then today's
 * availability; the product page carries the same answer on demand.
 */
describe('terroir, exportabilité des produits du catalogue (e2e)', { timeout: 60_000 }, () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 6 }, {
      imports: [RolesModule, AuditModule, TerroirModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('un statut par produit, la catégorie interdite en premier, les identifiants inconnus omis', async (context) => {
    const ctx = context as unknown as Context
    const world = await seedTerroirWorld(ctx.app, ctx.em)
    const catalog = ctx.app.get(ExportCatalogService)
    const [exportable, unavailable, ofSuspendedShop] = world.shopA.productIds
    const [pending, notRequested, rejected] = world.shopB.productIds

    // PENDING: a new weight sends the approval back to eBio.
    await catalog.upsertProfile(world.shopB.supplierId, pending, { packedWeightG: 300, shelfLifeDays: 365, origin: { photos: [] }, labelPhoto: null })
    await catalog.removeProfile(world.shopB.supplierId, notRequested)
    await catalog.review(rejected, { decision: 'REJECT', checklist: {}, reason: 'Note interne : étiquette illisible' }, world.agentId)
    await ctx.em.getConnection().execute(`UPDATE products SET stock = 0 WHERE id = ?`, [unavailable])

    // BANNED_CATEGORY wins over an approved profile.
    const tea = await seedShop(ctx.em, 'Thé Kinkéliba')
    await approveForExport(ctx.app, tea.supplierId, tea.productIds[0], world.agentId, 200)
    await ctx.app.get(PlatformSettingsService).setTerroirExportSettings({ bannedCategoryIds: [tea.categoryId] })
    fresh(ctx)

    const controller = ctx.app.get(TerroirClientController)
    const unknown = randomUUID()
    const ids = [exportable, unavailable, pending, notRequested, rejected, tea.productIds[0], unknown, tea.productIds[1]]
    const response = await controller.getExportability({ country: 'fr', productIds: ids.join(',') })

    expect(response.country).toBe('FR')
    expect(response.items.map(item => item.productId)).toEqual(ids.filter(id => id !== unknown))
    const byId = new Map(response.items.map(item => [item.productId, item]))
    expect(byId.get(exportable)).toEqual({ productId: exportable, status: 'EXPORTABLE', label: 'Exportable', reason: null, packedWeightG: 280 })
    expect(byId.get(unavailable)).toEqual({ productId: unavailable, status: 'UNAVAILABLE', label: 'Indisponible', reason: 'Ce produit n’est plus disponible pour le moment.', packedWeightG: null })
    expect(byId.get(pending)).toMatchObject({ status: 'PENDING', label: 'Bientôt exportable', reason: 'eBio vérifie ce produit pour l’export.', packedWeightG: null })
    expect(byId.get(notRequested)).toMatchObject({ status: 'NOT_REQUESTED', label: 'Non exportable', reason: 'Cette boutique ne propose pas encore ce produit à l’export.' })
    expect(byId.get(rejected)).toMatchObject({ status: 'REJECTED', label: 'Non exportable', reason: 'Ce produit ne peut pas voyager (contrôle eBio).' })
    expect(JSON.stringify(response)).not.toContain('Note interne')
    expect(byId.get(tea.productIds[0])).toMatchObject({ status: 'BANNED_CATEGORY', label: 'Non exportable', reason: 'Cette catégorie de produits ne peut pas être envoyée à l’étranger.', packedWeightG: null })
    expect(byId.get(tea.productIds[1])).toMatchObject({ status: 'BANNED_CATEGORY' })

    // A shop no longer taking orders: approved, but not available.
    await ctx.em.getConnection().execute(`UPDATE suppliers SET validation_status = 'SUSPENDED' WHERE id = ?`, [world.shopA.supplierId])
    const suspended = await controller.getExportability({ country: 'FR', productIds: ofSuspendedShop })
    expect(suspended.items).toEqual([expect.objectContaining({ status: 'UNAVAILABLE' })])
  })

  it('pays inconnu : 400 ; pays fermé : 409, comme le catalogue', async (context) => {
    const ctx = context as unknown as Context
    const world = await seedTerroirWorld(ctx.app, ctx.em)
    const controller = ctx.app.get(TerroirClientController)
    const productIds = world.shopA.productIds[0]

    expect(await refusalOf(controller.getExportability({ country: 'ZZ', productIds }))).toEqual({ status: 400, code: 'EXPORT_COUNTRY_UNKNOWN' })
    await ctx.em.getConnection().execute(`UPDATE export_countries SET is_active = false WHERE code = 'BE'`)
    expect(await refusalOf(controller.getExportability({ country: 'BE', productIds }))).toEqual({ status: 409, code: 'EXPORT_COUNTRY_INACTIVE' })
  })

  it('fiche produit : `exportability` avec `exportCountry`, null sans lui ou vers un pays fermé', async (context) => {
    const ctx = context as unknown as Context
    const world = await seedTerroirWorld(ctx.app, ctx.em)
    const controller = ctx.app.get(ProductsController)
    const session = { user: { id: world.buyerId } } as never
    const productId = world.shopA.productIds[0]

    const withCountry = await controller.findById(session, productId, 'FR') as Record<string, unknown>
    expect(withCountry.exportability).toEqual({ status: 'EXPORTABLE', label: 'Exportable', reason: null, packedWeightG: 280 })
    const without = await controller.findById(session, productId) as Record<string, unknown>
    expect(without.exportability).toBeNull()

    await ctx.app.get(ExportCatalogService).removeProfile(world.shopA.supplierId, productId)
    const notRequested = await controller.findById(session, productId, 'fr') as Record<string, unknown>
    expect(notRequested.exportability).toMatchObject({ status: 'NOT_REQUESTED', packedWeightG: null })

    await ctx.em.getConnection().execute(`UPDATE export_countries SET is_active = false WHERE code = 'FR'`)
    const closed = await controller.findById(session, productId, 'FR') as Record<string, unknown>
    expect(closed.exportability).toBeNull()
  })
})
