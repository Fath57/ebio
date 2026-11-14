import type { OnApplicationBootstrap, OnModuleInit } from '@nestjs/common'
import type { ExportCriteriaSettings } from './export-criteria'
import { RequestContext } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { ExportPackStatus, ExportProfileStatus } from './contracts/terroir.contract'
import { ExportPack } from './entities/export-pack.entity'
import { ExportProfile } from './entities/export-profile.entity'
import { packStatusFor, profileStatusFor, unmetProfileCriteria } from './export-criteria'

/** What eBio tells a shop about one of its products or packs. */
export type ExportNews = 'EXPORTABLE' | 'WITHDRAWN' | 'REINSTATED'

/**
 * Automatic export validation (011): a product (or pack) is exportable as
 * soon as it meets every criterion, with no review by eBio. Statuses are
 * stored, so the catalogue and the checkout stay plain queries; this service
 * recomputes them whenever an input changes: the profile, the product sheet,
 * the criteria settings, a withdrawal.
 */
@Injectable()
export class ExportCriteriaService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(ExportCriteriaService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly platformSettings: PlatformSettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.platformSettings.onTerroirExportSettingsChanged(async () => {
      await this.refreshAll()
    })
  }

  /** Self-healing at boot: rows written by a migration or by hand get their computed status. */
  async onApplicationBootstrap(): Promise<void> {
    try {
      // Outside any request: the settings service reads through the global
      // EntityManager, refused without a context of its own.
      await RequestContext.create(this.em, async () => {
        await this.refreshAll()
      })
    }
    catch (error) {
      this.logger.error('Export statuses recomputation at boot failed', error instanceof Error ? error.stack : String(error))
    }
  }

  /** The settings the criteria read. */
  async settings(): Promise<ExportCriteriaSettings> {
    const { bannedCategoryIds, minShelfLifeDays, maxUnitWeightG } = await this.platformSettings.getTerroirExportSettings()
    return { bannedCategoryIds, minShelfLifeDays, maxUnitWeightG }
  }

  /**
   * Recomputes a profile in memory (flush is the caller's). Product and its
   * category must be loaded. True when it just became exportable for the
   * first time: the shop is to be told.
   */
  evaluate(profile: ExportProfile, settings: ExportCriteriaSettings): boolean {
    const product = profile.product
    const unmet = unmetProfileCriteria({
      categoryId: product.category.id,
      ingredients: product.ingredients,
      productAllergens: product.allergens ?? [],
      packedWeightG: profile.packedWeightG,
      shelfLifeDays: profile.shelfLifeDays,
      storage: profile.storage,
      allergens: profile.allergens,
      noAllergens: profile.noAllergens,
      originProducer: profile.originProducer,
      originPlace: profile.originPlace,
      labelPhoto: profile.labelPhoto,
      declaresFrenchLabel: profile.declaresFrenchLabel,
      declaresDatesPrinted: profile.declaresDatesPrinted,
      declaresSealedPackaging: profile.declaresSealedPackaging,
    }, settings)
    const status = profileStatusFor(profile.status ?? null, unmet)
    if (JSON.stringify(profile.missingCriteria ?? []) !== JSON.stringify(unmet)) {
      profile.missingCriteria = unmet
    }
    if (profile.status !== status) {
      profile.status = status
    }
    if (status === ExportProfileStatus.EXPORTABLE && !profile.exportableSince) {
      profile.exportableSince = new Date()
      return true
    }
    return false
  }

  /**
   * Recomputes the profiles of these products, then the packs holding them,
   * and tells the shops of their products newly exportable. Runs on `em`
   * (the caller's, so the entities it holds are the ones updated).
   */
  async refreshProducts(productIds: string[], em: EntityManager = this.em): Promise<void> {
    const ids = [...new Set(productIds)]
    if (ids.length === 0) {
      return
    }
    const profiles = await em.find(ExportProfile, { product: { $in: ids } }, { populate: ['product', 'product.category', 'product.supplier'] })
    await this.recompute(em, profiles)
    await this.refreshPacksOf(ids, em)
  }

  /** Every profile and every pack, e.g. once the criteria settings changed. */
  async refreshAll(): Promise<void> {
    const em = this.em.fork()
    const profiles = await em.find(ExportProfile, {}, { populate: ['product', 'product.category', 'product.supplier'] })
    await this.recompute(em, profiles)
    const packs = await em.find(ExportPack, { status: { $ne: ExportPackStatus.RETIRED } })
    await this.refreshPacks(packs, em)
  }

  /** The packs (retired ones aside) holding any of these products. */
  async refreshPacksOf(productIds: string[], em: EntityManager = this.em): Promise<void> {
    if (productIds.length === 0) {
      return
    }
    const packs = await em.find(ExportPack, { status: { $ne: ExportPackStatus.RETIRED }, items: { product: { $in: productIds } } })
    await this.refreshPacks(packs, em)
  }

  /** Recomputes these packs and flushes. */
  async refreshPacks(packs: ExportPack[], em: EntityManager = this.em): Promise<void> {
    if (packs.length === 0) {
      return
    }
    await em.populate(packs, ['items', 'items.product'])
    const productIds = [...new Set(packs.flatMap(pack => pack.items.getItems().map(item => item.product.id)))]
    const rows = productIds.length === 0 ? [] : await em.find(ExportProfile, { product: { $in: productIds } })
    const statuses = new Map(rows.map(row => [row.product.id, row.status]))
    for (const pack of packs) {
      this.evaluatePack(pack, statuses)
    }
    await em.flush()
  }

  /** Recomputes a pack in memory; its items must be loaded. */
  evaluatePack(pack: ExportPack, statuses: Map<string, ExportProfileStatus>): void {
    const items = pack.items.getItems()
    const met = {
      products_exportable: items.length > 0 && items.every(item => statuses.get(item.product.id) === ExportProfileStatus.EXPORTABLE),
      name: Boolean(pack.name?.trim()),
      price: Number(pack.price) > 0,
      photo: (pack.photos ?? []).length > 0,
    }
    const unmet = (Object.keys(met) as Array<keyof typeof met>).filter(key => !met[key])
    if (JSON.stringify(pack.missingCriteria ?? []) !== JSON.stringify(unmet)) {
      pack.missingCriteria = unmet
    }
    const status = packStatusFor(pack.status ?? null, unmet)
    if (pack.status !== status) {
      pack.status = status
    }
  }

  /** Push and in-app message to a shop owner. Never throws. */
  async notify(input: { userId: string, subject: string, news: ExportNews, reason?: string | null, data: Record<string, unknown> }): Promise<void> {
    const texts: Record<ExportNews, { title: string, body: string }> = {
      EXPORTABLE: {
        title: 'Produit exportable',
        body: `${input.subject} remplit tous les critères d’export : il est proposé aux clients à l’étranger.`,
      },
      WITHDRAWN: {
        title: 'Retiré de l’export',
        body: `eBio a retiré ${input.subject} de l’export${input.reason ? ` : ${input.reason}` : '.'}`,
      },
      REINSTATED: {
        title: 'De retour à l’export',
        body: `eBio a remis ${input.subject} à l’export. Il est de nouveau proposé à l’étranger dès que tous les critères sont remplis.`,
      },
    }
    try {
      const user = await this.em.fork().findOne(User, { id: input.userId })
      if (!user) {
        return
      }
      const { title, body } = texts[input.news]
      await this.notifications.send({
        user,
        type: NotificationType.EXPORT_PRODUCT_REVIEWED,
        title,
        body,
        data: { ...input.data, news: input.news },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      })
    }
    catch (error) {
      this.logger.error(`Export notification to ${input.userId} failed`, error instanceof Error ? error.stack : String(error))
    }
  }

  private async recompute(em: EntityManager, profiles: ExportProfile[]): Promise<void> {
    if (profiles.length === 0) {
      return
    }
    const settings = await this.settings()
    const newlyExportable = profiles.filter(profile => this.evaluate(profile, settings))
    await em.flush()
    for (const profile of newlyExportable) {
      const ownerId = await this.ownerOf(em, profile.product.supplier.id)
      if (ownerId) {
        await this.notify({ userId: ownerId, subject: `« ${profile.product.name} »`, news: 'EXPORTABLE', data: { productId: profile.product.id } })
      }
    }
  }

  private async ownerOf(em: EntityManager, supplierId: string): Promise<string | null> {
    const [row] = await em.getConnection().execute<Array<{ user_id: string | null }>>(
      `SELECT user_id FROM suppliers WHERE id = ?`,
      [supplierId],
    )
    return row?.user_id ?? null
  }
}
