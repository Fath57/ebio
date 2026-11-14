import type { AdminExportPacksQuery, AdminExportProductsQuery, ExportPackInput, ExportProfileInput, UpdateExportPack } from './contracts/terroir.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { HttpStatus, Injectable } from '@nestjs/common'
import { AuditService } from '../admin/audit.service'
import { User } from '../auth/auth.entity'
import { ProductVariant } from '../products/entities/product-variant.entity'
import { Product, ProductModeration, ProductStatus } from '../products/entities/product.entity'
import { Supplier, SupplierMode, ValidationStatus } from '../suppliers/supplier.entity'
import { ExportPackStatus, ExportProfileStatus } from './contracts/terroir.contract'
import { ExportPackItem } from './entities/export-pack-item.entity'
import { ExportPack } from './entities/export-pack.entity'
import { ExportProfile } from './entities/export-profile.entity'
import { ExportCriteriaService } from './export-criteria.service'
import { terroirError } from './terroir-texts'

/** A pack with what its lines are worth today and whether it can be ordered. */
export interface PackView {
  pack: ExportPack
  /** Export status of each product, by product id; absent: never asked. */
  profiles: Map<string, ExportProfileStatus>
  linesTotal: number
  orderable: boolean
}

/** One page of the buyers' terroir catalogue. */
export interface ClientCatalog {
  /** Approved profiles, product, shop and category populated. */
  profiles: ExportProfile[]
  /** Orderable packs, on the first page only. */
  packs: PackView[]
  /** Packed weight of each pack, by pack id. */
  packWeights: Map<string, number>
  hasMore: boolean
}

export interface ClientPackView extends PackView {
  weightG: number
  /** Approved profiles of the pack's products, by product id. */
  details: Map<string, ExportProfile>
}

export const CATALOG_PAGE_SIZE = 20

/** Grams a line weighs: a « pack de N » variant weighs N units. */
export function lineWeight(profile: Pick<ExportProfile, 'packedWeightG'>, variant: Pick<ProductVariant, 'packSize'> | null | undefined, quantity: number): number {
  // An exportable profile always has its weight (export criterion).
  return (profile.packedWeightG ?? 0) * (variant?.packSize && variant.packSize > 1 ? variant.packSize : 1) * quantity
}

/** What buyers abroad may see of a product: approved for export, on sale, from a live shop. */
function sellableProductFilter() {
  return {
    status: ProductStatus.ACTIVE,
    moderationStatus: ProductModeration.APPROVED,
    stock: { $gt: 0 },
    supplier: { validationStatus: ValidationStatus.VALIDATED, mode: SupplierMode.ORDER },
  }
}

/** One page of the back office's export watch. */
export interface AdminExportProductsPage {
  /** Product, shop and category populated. */
  profiles: ExportProfile[]
  total: number
  page: number
  counts: Record<ExportProfileStatus, number>
}

export const ADMIN_EXPORT_PAGE_SIZE = 20

/** The unit price of a pack line: its variant's when it has one. */
export function packLinePrice(item: ExportPackItem): number {
  return Number(item.variant?.pricePerUnit ?? item.product.pricePerUnit)
}

/**
 * Units of the product a pack line draws: a « pack de N » variant takes N per
 * unit from the product's own stock.
 */
function unitsDrawn(item: ExportPackItem): number {
  return item.quantity * (item.variant?.packSize ?? 1)
}

function packNotFound() {
  return terroirError(HttpStatus.NOT_FOUND, 'EXPORT_PACK_NOT_FOUND', 'Pack introuvable.')
}

/**
 * Exportable products and terroir packs (011, US3). A product (or pack) is
 * exportable as soon as it meets every criterion (ExportCriteriaService):
 * eBio no longer reviews, it may only withdraw and reinstate.
 */
@Injectable()
export class ExportCatalogService {
  constructor(
    private readonly em: EntityManager,
    private readonly criteria: ExportCriteriaService,
    private readonly audit: AuditService,
  ) {}

  // ===== EXPORT PROFILES =====

  async getProfile(supplierId: string, productId: string): Promise<ExportProfile | null> {
    await this.ownProduct(supplierId, productId)
    return this.em.findOne(ExportProfile, { product: productId })
  }

  /**
   * Saves a product's export profile. Nothing is refused for being
   * incomplete: the status is recomputed at once (EXPORTABLE when every
   * criterion is met, INCOMPLETE otherwise, WITHDRAWN stays) and the
   * response lists what is missing.
   */
  async upsertProfile(supplierId: string, productId: string, input: ExportProfileInput): Promise<ExportProfile> {
    const product = await this.ownProduct(supplierId, productId)
    const values = {
      packedWeightG: input.packedWeightG ?? null,
      lengthCm: input.lengthCm ?? null,
      widthCm: input.widthCm ?? null,
      heightCm: input.heightCm ?? null,
      shelfLifeDays: input.shelfLifeDays ?? null,
      storage: input.storage ?? null,
      allergens: input.allergens ?? null,
      noAllergens: input.noAllergens ?? false,
      originProducer: input.origin.producer ?? null,
      originPlace: input.origin.place ?? null,
      originYear: input.origin.year ?? null,
      originMethod: input.origin.method ?? null,
      originPhotos: input.origin.photos,
      labelPhoto: input.labelPhoto ?? null,
      declaresFrenchLabel: input.declaresFrenchLabel ?? false,
      declaresDatesPrinted: input.declaresDatesPrinted ?? false,
      declaresSealedPackaging: input.declaresSealedPackaging ?? false,
    }
    let profile = await this.em.findOne(ExportProfile, { product: productId })
    if (!profile) {
      profile = this.em.create(ExportProfile, { product, ...values })
    }
    else {
      this.em.assign(profile, values)
    }
    await this.em.flush()
    await this.criteria.refreshProducts([productId])
    return profile
  }

  /** Takes the product off the export catalogue; packs holding it stop being exportable. */
  async removeProfile(supplierId: string, productId: string): Promise<void> {
    await this.ownProduct(supplierId, productId)
    await this.em.nativeDelete(ExportProfile, { product: productId })
    await this.criteria.refreshPacksOf([productId])
  }

  // ===== EBIO'S WATCH: WITHDRAW, REINSTATE =====

  /** Every product offered for export, by status and name or shop, newest change first. */
  async listForAdmin(query: AdminExportProductsQuery): Promise<AdminExportProductsPage> {
    const where: Record<string, unknown> = {}
    if (query.status) {
      where.status = query.status
    }
    if (query.search) {
      const pattern = `%${query.search.replace(/[%_\\]/g, '')}%`
      where.$or = [
        { product: { name: { $ilike: pattern } } },
        { product: { supplier: { shopName: { $ilike: pattern } } } },
      ]
    }
    const [profiles, total] = await this.em.findAndCount(ExportProfile, where, {
      populate: ['product', 'product.supplier', 'product.category'],
      orderBy: { updatedAt: 'DESC' },
      limit: ADMIN_EXPORT_PAGE_SIZE,
      offset: (query.page - 1) * ADMIN_EXPORT_PAGE_SIZE,
    })
    const rows = await this.em.getConnection().execute<Array<{ status: ExportProfileStatus, count: number }>>(
      `SELECT status, COUNT(*)::int AS count FROM export_profiles GROUP BY status`,
    )
    const counts = { [ExportProfileStatus.EXPORTABLE]: 0, [ExportProfileStatus.INCOMPLETE]: 0, [ExportProfileStatus.WITHDRAWN]: 0 }
    for (const row of rows) {
      if (row.status in counts) {
        counts[row.status] = row.count
      }
    }
    return { profiles, total, page: query.page, counts }
  }

  /** eBio takes a product off the export, whatever its criteria; the shop gets the reason. */
  async withdraw(productId: string, reason: string, agentId: string): Promise<ExportProfile> {
    const profile = await this.adminProfile(productId)
    if (profile.status === ExportProfileStatus.WITHDRAWN) {
      throw terroirError(HttpStatus.CONFLICT, 'EXPORT_ALREADY_WITHDRAWN', 'Ce produit est déjà retiré de l’export.')
    }
    profile.status = ExportProfileStatus.WITHDRAWN
    profile.withdrawnReason = reason
    profile.withdrawnBy = this.em.getReference(User, agentId)
    profile.withdrawnAt = new Date()
    await this.em.flush()
    await this.criteria.refreshPacksOf([productId])

    await this.audit.record({ actorUserId: agentId, action: 'EXPORT_PRODUCT_WITHDRAWN', targetType: 'product', targetId: productId, reason })
    await this.tellShop(profile.product.supplier.id, `« ${profile.product.name} »`, 'WITHDRAWN', reason, { productId })
    return profile
  }

  /** Lifts a withdrawal: the status is computed again from the criteria. */
  async reinstate(productId: string, agentId: string): Promise<ExportProfile> {
    const profile = await this.adminProfile(productId)
    if (profile.status !== ExportProfileStatus.WITHDRAWN) {
      throw terroirError(HttpStatus.CONFLICT, 'EXPORT_NOT_WITHDRAWN', 'Ce produit n’est pas retiré de l’export.')
    }
    profile.status = ExportProfileStatus.INCOMPLETE
    await this.em.flush()
    await this.criteria.refreshProducts([productId])

    await this.audit.record({ actorUserId: agentId, action: 'EXPORT_PRODUCT_REINSTATED', targetType: 'product', targetId: productId })
    await this.tellShop(profile.product.supplier.id, `« ${profile.product.name} »`, 'REINSTATED', null, { productId })
    return profile
  }

  async withdrawPack(packId: string, reason: string, agentId: string): Promise<PackView> {
    const pack = await this.loadPack(packId)
    if (pack.status === ExportPackStatus.RETIRED) {
      throw terroirError(HttpStatus.CONFLICT, 'EXPORT_PACK_RETIRED', 'Ce pack a été retiré.')
    }
    if (pack.status === ExportPackStatus.WITHDRAWN) {
      throw terroirError(HttpStatus.CONFLICT, 'EXPORT_ALREADY_WITHDRAWN', 'Ce pack est déjà retiré de l’export.')
    }
    pack.status = ExportPackStatus.WITHDRAWN
    pack.withdrawnReason = reason
    pack.withdrawnBy = this.em.getReference(User, agentId)
    pack.withdrawnAt = new Date()
    await this.em.flush()

    await this.audit.record({ actorUserId: agentId, action: 'EXPORT_PACK_WITHDRAWN', targetType: 'export_pack', targetId: pack.id, reason })
    if (pack.supplier) {
      await this.tellShop(pack.supplier.id, `le pack « ${pack.name} »`, 'WITHDRAWN', reason, { packId: pack.id })
    }
    return this.packView(pack)
  }

  async reinstatePack(packId: string, agentId: string): Promise<PackView> {
    const pack = await this.loadPack(packId)
    if (pack.status !== ExportPackStatus.WITHDRAWN) {
      throw terroirError(HttpStatus.CONFLICT, 'EXPORT_NOT_WITHDRAWN', 'Ce pack n’est pas retiré de l’export.')
    }
    pack.status = ExportPackStatus.INCOMPLETE
    await this.criteria.refreshPacks([pack])

    await this.audit.record({ actorUserId: agentId, action: 'EXPORT_PACK_REINSTATED', targetType: 'export_pack', targetId: pack.id })
    if (pack.supplier) {
      await this.tellShop(pack.supplier.id, `le pack « ${pack.name} »`, 'REINSTATED', null, { packId: pack.id })
    }
    return this.packView(pack)
  }

  // ===== PACKS =====

  /** A shop's packs, retired ones included (orders still quote them). */
  async listPacks(supplierId: string | null): Promise<PackView[]> {
    const packs = await this.em.find(ExportPack, { supplier: supplierId }, { orderBy: { createdAt: 'DESC' } })
    return this.packViews(packs)
  }

  /** The back office's packs: eBio's own, or every pack, newest first. */
  async listPacksForAdmin(query: AdminExportPacksQuery): Promise<PackView[]> {
    const where: Record<string, unknown> = {}
    if (query.scope === 'ebio') {
      where.supplier = null
    }
    if (query.status) {
      where.status = query.status
    }
    const packs = await this.em.find(ExportPack, where, { orderBy: { createdAt: 'DESC' } })
    return this.packViews(packs)
  }

  /**
   * A shop composes from its own products only (EXPORT_PACK_FOREIGN_PRODUCT);
   * eBio composes across shops. Every product must have an export profile
   * not withdrawn; the pack is exportable at once when every product is and
   * it has a name, a price and a photo.
   */
  async createPack(supplierId: string | null, input: ExportPackInput, actorUserId: string): Promise<PackView> {
    const pack = this.em.create(ExportPack, {
      supplier: supplierId ? this.em.getReference(Supplier, supplierId) : null,
      name: input.name,
      description: input.description ?? null,
      photos: input.photos,
      price: String(input.price),
    })
    await this.setItems(pack, supplierId, input.items)
    await this.em.flush()
    await this.criteria.refreshPacks([pack])
    if (!supplierId) {
      await this.audit.record({ actorUserId, action: 'EXPORT_PACK_CREATED', targetType: 'export_pack', targetId: pack.id, payload: { name: pack.name, price: input.price } })
    }
    return this.packView(await this.loadPack(pack.id))
  }

  /** Any change recomputes the pack's status; a withdrawal stays. */
  async updatePack(supplierId: string | null, packId: string, input: UpdateExportPack, actorUserId: string): Promise<PackView> {
    const pack = await this.loadPack(packId)
    if ((pack.supplier?.id ?? null) !== supplierId) {
      throw packNotFound()
    }
    if (pack.status === ExportPackStatus.RETIRED) {
      throw terroirError(HttpStatus.CONFLICT, 'EXPORT_PACK_RETIRED', 'Ce pack a été retiré.')
    }
    if (input.name !== undefined) {
      pack.name = input.name
    }
    if (input.description !== undefined) {
      pack.description = input.description
    }
    if (input.photos !== undefined) {
      pack.photos = input.photos
    }
    if (input.price !== undefined) {
      pack.price = String(input.price)
    }
    if (input.items !== undefined) {
      await this.setItems(pack, supplierId, input.items)
    }
    await this.em.flush()
    await this.criteria.refreshPacks([pack])
    if (!supplierId) {
      await this.audit.record({ actorUserId, action: 'EXPORT_PACK_UPDATED', targetType: 'export_pack', targetId: pack.id, payload: { ...input } })
    }
    this.em.clear()
    return this.packView(await this.loadPack(pack.id))
  }

  async retirePack(supplierId: string | null, packId: string, actorUserId: string): Promise<PackView> {
    const pack = await this.loadPack(packId)
    if ((pack.supplier?.id ?? null) !== supplierId) {
      throw packNotFound()
    }
    pack.status = ExportPackStatus.RETIRED
    await this.em.flush()
    if (!supplierId) {
      await this.audit.record({ actorUserId, action: 'EXPORT_PACK_RETIRED', targetType: 'export_pack', targetId: pack.id })
    }
    return this.packView(pack)
  }

  async getPack(packId: string): Promise<PackView> {
    return this.packView(await this.loadPack(packId))
  }

  /**
   * A pack can be ordered while it is exportable and every product is
   * exportable, on sale, approved by moderation and in stock for the pack
   * (FR-006).
   */
  isPackOrderable(pack: ExportPack, profiles: Map<string, ExportProfileStatus>): boolean {
    if (pack.status !== ExportPackStatus.EXPORTABLE || pack.items.length === 0) {
      return false
    }
    return pack.items.getItems().every((item) => {
      const product = item.product
      const stock = item.variant && !item.variant.packSize ? item.variant.stock : product.stock
      return profiles.get(product.id) === ExportProfileStatus.EXPORTABLE
        && product.status === ProductStatus.ACTIVE
        && product.moderationStatus === ProductModeration.APPROVED
        && stock >= (item.variant && !item.variant.packSize ? item.quantity : unitsDrawn(item))
    })
  }

  // ===== BUYERS ABROAD (US1) =====

  /**
   * The terroir catalogue (FR-007): approved products on sale, then the
   * orderable packs. Country-blind in v1, both countries get the same
   * catalogue; the country only decides the departures.
   */
  async clientCatalog(filters: { category?: string, search?: string, page: number }): Promise<ClientCatalog> {
    const product: Record<string, unknown> = { ...sellableProductFilter() }
    if (filters.category) {
      product.category = filters.category
    }
    if (filters.search) {
      product.name = { $ilike: `%${filters.search.replace(/[%_\\]/g, '')}%` }
    }
    const profiles = await this.em.find(
      ExportProfile,
      { status: ExportProfileStatus.EXPORTABLE, product },
      {
        populate: ['product', 'product.supplier', 'product.category'],
        orderBy: { product: { name: 'ASC' } },
        limit: CATALOG_PAGE_SIZE + 1,
        offset: (filters.page - 1) * CATALOG_PAGE_SIZE,
      },
    )
    const hasMore = profiles.length > CATALOG_PAGE_SIZE

    let packs: PackView[] = []
    const packWeights = new Map<string, number>()
    if (filters.page === 1) {
      const where: Record<string, unknown> = { status: ExportPackStatus.EXPORTABLE }
      if (filters.search) {
        where.name = { $ilike: `%${filters.search.replace(/[%_\\]/g, '')}%` }
      }
      const candidates = await this.em.find(ExportPack, where, { orderBy: { name: 'ASC' } })
      packs = (await this.packViews(candidates)).filter(view => view.orderable)
      const weights = await this.packWeightsOf(packs.map(view => view.pack))
      for (const [id, weight] of weights) {
        packWeights.set(id, weight)
      }
    }
    return { profiles: profiles.slice(0, CATALOG_PAGE_SIZE), packs, packWeights, hasMore }
  }

  /** A product's terroir page; 404 unless approved and on sale. */
  async clientProduct(productId: string): Promise<{ profile: ExportProfile, variants: ProductVariant[] }> {
    const profile = await this.em.findOne(
      ExportProfile,
      { product: { id: productId, ...sellableProductFilter(), stock: { $gte: 0 } }, status: ExportProfileStatus.EXPORTABLE },
      { populate: ['product', 'product.supplier', 'product.category'] },
    )
    if (!profile) {
      throw terroirError(HttpStatus.NOT_FOUND, 'TERROIR_PRODUCT_NOT_FOUND', 'Ce produit n\'est pas proposé à l\'étranger.')
    }
    const variants = await this.em.find(ProductVariant, { product: productId }, { orderBy: { pricePerUnit: 'ASC' } })
    return { profile, variants }
  }

  /** A pack's terroir page; 404 unless exportable. Orderable or not, it says which. */
  async clientPack(packId: string): Promise<ClientPackView> {
    const pack = await this.loadPack(packId)
    if (pack.status !== ExportPackStatus.EXPORTABLE) {
      throw packNotFound()
    }
    const view = await this.packView(pack)
    const productIds = pack.items.getItems().map(item => item.product.id)
    const profiles = await this.em.find(ExportProfile, { product: { $in: productIds } })
    const weights = await this.packWeightsOf([pack])
    return {
      ...view,
      weightG: weights.get(pack.id) ?? 0,
      details: new Map(profiles.map(profile => [profile.product.id, profile])),
    }
  }

  /**
   * Approved exportable products that fit in `marginG` at no extra shipping
   * cost (US8), the heaviest that fits first, minus what the cart already holds.
   */
  async suggestionsWithin(marginG: number, excludeProductIds: string[], limit = 6): Promise<ExportProfile[]> {
    if (marginG <= 0) {
      return []
    }
    const product: Record<string, unknown> = { ...sellableProductFilter() }
    if (excludeProductIds.length > 0) {
      product.id = { $nin: excludeProductIds }
    }
    return this.em.find(
      ExportProfile,
      { status: ExportProfileStatus.EXPORTABLE, packedWeightG: { $lte: marginG }, product },
      { populate: ['product', 'product.supplier'], orderBy: { packedWeightG: 'DESC' }, limit },
    )
  }

  /** Packed weight of one of each pack, from its products' export profiles. */
  async packWeightsOf(packs: ExportPack[]): Promise<Map<string, number>> {
    const productIds = [...new Set(packs.flatMap(pack => pack.items.getItems().map(item => item.product.id)))]
    const profiles = productIds.length === 0 ? [] : await this.em.find(ExportProfile, { product: { $in: productIds } })
    const byProduct = new Map(profiles.map(profile => [profile.product.id, profile]))
    return new Map(packs.map(pack => [pack.id, pack.items.getItems().reduce((total, item) => {
      const profile = byProduct.get(item.product.id)
      return total + (profile ? lineWeight(profile, item.variant, item.quantity) : 0)
    }, 0)]))
  }

  /** Packs with their items, for the terroir checkout. */
  async packsForCheckout(packIds: string[]): Promise<PackView[]> {
    if (packIds.length === 0) {
      return []
    }
    const packs = await this.em.find(ExportPack, { id: { $in: packIds } })
    return this.packViews(packs)
  }

  // ===== INTERNALS =====

  private async ownProduct(supplierId: string, productId: string): Promise<Product> {
    const product = await this.em.findOne(Product, { id: productId }, { populate: ['supplier', 'category'] })
    if (!product) {
      throw terroirError(HttpStatus.NOT_FOUND, 'PRODUCT_NOT_FOUND', 'Produit introuvable.')
    }
    if (product.supplier.id !== supplierId) {
      throw terroirError(HttpStatus.FORBIDDEN, 'PRODUCT_NOT_OWNED', 'Ce produit ne vous appartient pas.')
    }
    return product
  }

  private async loadPack(packId: string): Promise<ExportPack> {
    const pack = await this.em.findOne(
      ExportPack,
      { id: packId },
      { populate: ['supplier', 'items', 'items.product', 'items.product.supplier', 'items.variant'] },
    )
    if (!pack) {
      throw packNotFound()
    }
    return pack
  }

  private async setItems(pack: ExportPack, supplierId: string | null, items: ExportPackInput['items']): Promise<void> {
    const productIds = [...new Set(items.map(item => item.productId))]
    const products = await this.em.find(Product, { id: { $in: productIds } }, { populate: ['supplier'] })
    const byId = new Map(products.map(product => [product.id, product]))
    const profiles = await this.em.find(ExportProfile, { product: { $in: productIds } })
    const asked = new Set(profiles.filter(profile => profile.status !== ExportProfileStatus.WITHDRAWN).map(profile => profile.product.id))

    const seen = new Set<string>()
    for (const item of items) {
      const product = byId.get(item.productId)
      if (!product) {
        throw terroirError(HttpStatus.NOT_FOUND, 'PRODUCT_NOT_FOUND', 'Produit introuvable.')
      }
      if (supplierId && product.supplier.id !== supplierId) {
        throw terroirError(HttpStatus.BAD_REQUEST, 'EXPORT_PACK_FOREIGN_PRODUCT', `« ${product.name} » n'est pas un produit de votre boutique.`)
      }
      if (!asked.has(product.id)) {
        throw terroirError(HttpStatus.BAD_REQUEST, 'EXPORT_PACK_NOT_EXPORTABLE', `« ${product.name} » n'est pas proposé à l'export.`)
      }
      const key = `${item.productId}:${item.variantId ?? ''}`
      if (seen.has(key)) {
        throw terroirError(HttpStatus.BAD_REQUEST, 'EXPORT_PACK_DUPLICATE', `« ${product.name} » apparaît deux fois dans le pack.`)
      }
      seen.add(key)
    }

    const variantIds = items.map(item => item.variantId).filter((id): id is string => Boolean(id))
    const variants = variantIds.length === 0 ? [] : await this.em.find(ProductVariant, { id: { $in: variantIds } })
    const variantById = new Map(variants.map(variant => [variant.id, variant]))

    pack.items.removeAll()
    for (const item of items) {
      const variant = item.variantId ? variantById.get(item.variantId) : null
      if (item.variantId && variant?.product.id !== item.productId) {
        throw terroirError(HttpStatus.BAD_REQUEST, 'EXPORT_PACK_VARIANT', 'Cette variante n\'appartient pas au produit choisi.')
      }
      pack.items.add(this.em.create(ExportPackItem, {
        pack,
        product: byId.get(item.productId)!,
        variant: variant ?? null,
        quantity: item.quantity,
      }))
    }
  }

  private async packView(pack: ExportPack): Promise<PackView> {
    const [view] = await this.packViews([pack])
    return view
  }

  private async packViews(packs: ExportPack[]): Promise<PackView[]> {
    if (packs.length === 0) {
      return []
    }
    await this.em.populate(packs, ['supplier', 'items', 'items.product', 'items.product.supplier', 'items.variant'])
    const productIds = [...new Set(packs.flatMap(pack => pack.items.getItems().map(item => item.product.id)))]
    const rows = productIds.length === 0 ? [] : await this.em.find(ExportProfile, { product: { $in: productIds } })
    const profiles = new Map(rows.map(row => [row.product.id, row.status]))
    return packs.map(pack => ({
      pack,
      profiles,
      linesTotal: Math.round(pack.items.getItems().reduce((total, item) => total + packLinePrice(item) * item.quantity, 0) * 100) / 100,
      orderable: this.isPackOrderable(pack, profiles),
    }))
  }

  private async adminProfile(productId: string): Promise<ExportProfile> {
    const profile = await this.em.findOne(ExportProfile, { product: productId }, { populate: ['product', 'product.supplier', 'product.category'] })
    if (!profile) {
      throw terroirError(HttpStatus.NOT_FOUND, 'EXPORT_PROFILE_NOT_FOUND', 'Ce produit n’a pas de profil d’export.')
    }
    return profile
  }

  private async tellShop(supplierId: string, subject: string, news: 'WITHDRAWN' | 'REINSTATED', reason: string | null, data: Record<string, unknown>): Promise<void> {
    const shop = await this.em.findOne(Supplier, { id: supplierId }, { populate: ['user'] })
    if (shop?.user) {
      await this.criteria.notify({ userId: shop.user.id, subject, news, reason, data })
    }
  }
}
