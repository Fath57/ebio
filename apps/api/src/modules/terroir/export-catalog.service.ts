import type { ExportChecklist, ExportPackInput, ExportProfileInput, ReviewExportPack, ReviewExportProduct, UpdateExportPack } from './contracts/terroir.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { HttpStatus, Injectable } from '@nestjs/common'
import { AuditService } from '../admin/audit.service'
import { User } from '../auth/auth.entity'
import { ProductVariant } from '../products/entities/product-variant.entity'
import { Product, ProductModeration, ProductStatus } from '../products/entities/product.entity'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { Supplier, SupplierMode, ValidationStatus } from '../suppliers/supplier.entity'
import { EXPORT_CHECKLIST_KEYS, ExportPackStatus, ExportProfileStatus } from './contracts/terroir.contract'
import { ExportPackItem } from './entities/export-pack-item.entity'
import { ExportPack } from './entities/export-pack.entity'
import { ExportProfile } from './entities/export-profile.entity'
import { TerroirNotifierService } from './terroir-notifier.service'
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
  return profile.packedWeightG * (variant?.packSize && variant.packSize > 1 ? variant.packSize : 1) * quantity
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

export interface ReviewQueue {
  profiles: ExportProfile[]
  packs: PackView[]
}

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
 * Exportable products and terroir packs (011, US3): the shop's request, the
 * banned categories, eBio's checklist, and the packs built from approved
 * products only.
 */
@Injectable()
export class ExportCatalogService {
  constructor(
    private readonly em: EntityManager,
    private readonly platformSettings: PlatformSettingsService,
    private readonly notifier: TerroirNotifierService,
    private readonly audit: AuditService,
  ) {}

  // ===== EXPORT PROFILES =====

  async getProfile(supplierId: string, productId: string): Promise<ExportProfile | null> {
    await this.ownProduct(supplierId, productId)
    return this.em.findOne(ExportProfile, { product: productId })
  }

  /**
   * Asks for (or updates) a product's export. Refused at once in a banned
   * category (FR-003). Any change sends it back to eBio (FR-002); saving the
   * same values again leaves an approval in place.
   */
  async upsertProfile(supplierId: string, productId: string, input: ExportProfileInput): Promise<ExportProfile> {
    const product = await this.ownProduct(supplierId, productId)
    const { bannedCategoryIds } = await this.platformSettings.getTerroirExportSettings()
    if (bannedCategoryIds.includes(product.category.id)) {
      throw terroirError(HttpStatus.BAD_REQUEST, 'EXPORT_CATEGORY_BANNED', `Les produits de la catégorie « ${product.category.name} » ne peuvent pas être envoyés à l'étranger.`)
    }

    const values = {
      packedWeightG: input.packedWeightG,
      lengthCm: input.lengthCm ?? null,
      widthCm: input.widthCm ?? null,
      heightCm: input.heightCm ?? null,
      shelfLifeDays: input.shelfLifeDays,
      originProducer: input.origin.producer ?? null,
      originPlace: input.origin.place ?? null,
      originYear: input.origin.year ?? null,
      originMethod: input.origin.method ?? null,
      originPhotos: input.origin.photos,
      labelPhoto: input.labelPhoto ?? null,
    }
    let profile = await this.em.findOne(ExportProfile, { product: productId })
    if (!profile) {
      profile = this.em.create(ExportProfile, { product, ...values })
    }
    else if (this.differs(profile, values)) {
      this.em.assign(profile, { ...values, status: ExportProfileStatus.PENDING, rejectionReason: null })
    }
    await this.em.flush()
    return profile
  }

  /** Takes the product off the export catalogue; packs holding it stop being orderable. */
  async removeProfile(supplierId: string, productId: string): Promise<void> {
    await this.ownProduct(supplierId, productId)
    await this.em.nativeDelete(ExportProfile, { product: productId })
  }

  // ===== REVIEW =====

  async reviewQueue(status: ExportProfileStatus): Promise<ReviewQueue> {
    const profiles = await this.em.find(
      ExportProfile,
      { status },
      { populate: ['product', 'product.supplier', 'product.category'], orderBy: { updatedAt: 'ASC' } },
    )
    const packs = await this.em.find(
      ExportPack,
      { status: status as unknown as ExportPackStatus },
      { orderBy: { updatedAt: 'ASC' } },
    )
    return { profiles, packs: await this.packViews(packs) }
  }

  /**
   * eBio's decision on a product (FR-002): approving takes every checklist
   * key ticked and the label photo; refusing takes a reason. The ticked list,
   * the agent and the date stay with the product.
   */
  async review(productId: string, input: ReviewExportProduct, agentId: string): Promise<ExportProfile> {
    const profile = await this.em.findOne(ExportProfile, { product: productId }, { populate: ['product', 'product.supplier', 'product.supplier.user', 'product.category'] })
    if (!profile) {
      throw terroirError(HttpStatus.NOT_FOUND, 'EXPORT_PROFILE_NOT_FOUND', 'Ce produit n\'a pas de demande d\'export.')
    }
    const checklist: ExportChecklist = Object.fromEntries(EXPORT_CHECKLIST_KEYS.map(key => [key, input.checklist[key] === true]))
    const approve = input.decision === 'APPROVE'
    if (approve) {
      if (!profile.labelPhoto) {
        throw terroirError(HttpStatus.BAD_REQUEST, 'EXPORT_LABEL_PHOTO_REQUIRED', 'La photo de l\'étiquette est obligatoire pour valider ce produit.')
      }
      if (EXPORT_CHECKLIST_KEYS.some(key => !checklist[key])) {
        throw terroirError(HttpStatus.BAD_REQUEST, 'EXPORT_CHECKLIST_INCOMPLETE', 'Cochez toute la liste de contrôle avant de valider.')
      }
      const { bannedCategoryIds } = await this.platformSettings.getTerroirExportSettings()
      if (bannedCategoryIds.includes(profile.product.category.id)) {
        throw terroirError(HttpStatus.BAD_REQUEST, 'EXPORT_CATEGORY_BANNED', 'Cette catégorie est interdite à l\'export.')
      }
    }
    else if (!input.reason) {
      throw terroirError(HttpStatus.BAD_REQUEST, 'EXPORT_REASON_REQUIRED', 'Indiquez le motif du refus.')
    }

    profile.status = approve ? ExportProfileStatus.APPROVED : ExportProfileStatus.REJECTED
    profile.checklist = checklist
    profile.reviewedBy = this.em.getReference(User, agentId)
    profile.reviewedAt = new Date()
    profile.rejectionReason = approve ? null : input.reason ?? null
    await this.em.flush()

    await this.audit.record({
      actorUserId: agentId,
      action: approve ? 'EXPORT_PRODUCT_APPROVED' : 'EXPORT_PRODUCT_REJECTED',
      targetType: 'product',
      targetId: productId,
      reason: input.reason ?? undefined,
      payload: { checklist },
    })
    const owner = profile.product.supplier.user
    if (owner) {
      await this.notifier.exportReviewed({
        userId: owner.id,
        subject: profile.product.name,
        approved: approve,
        reason: profile.rejectionReason,
        data: { productId },
      })
    }
    return profile
  }

  async reviewPack(packId: string, input: ReviewExportPack, agentId: string): Promise<PackView> {
    const pack = await this.loadPack(packId)
    if (pack.status === ExportPackStatus.RETIRED) {
      throw terroirError(HttpStatus.CONFLICT, 'EXPORT_PACK_RETIRED', 'Ce pack a été retiré.')
    }
    const approve = input.decision === 'APPROVE'
    if (!approve && !input.reason) {
      throw terroirError(HttpStatus.BAD_REQUEST, 'EXPORT_REASON_REQUIRED', 'Indiquez le motif du refus.')
    }
    pack.status = approve ? ExportPackStatus.APPROVED : ExportPackStatus.REJECTED
    pack.rejectionReason = approve ? null : input.reason ?? null
    pack.reviewedBy = this.em.getReference(User, agentId)
    pack.reviewedAt = new Date()
    await this.em.flush()

    await this.audit.record({
      actorUserId: agentId,
      action: approve ? 'EXPORT_PACK_APPROVED' : 'EXPORT_PACK_REJECTED',
      targetType: 'export_pack',
      targetId: pack.id,
      reason: input.reason ?? undefined,
    })
    const owner = pack.supplier ? await this.em.findOne(Supplier, { id: pack.supplier.id }, { populate: ['user'] }) : null
    if (owner?.user) {
      await this.notifier.exportReviewed({
        userId: owner.user.id,
        subject: `Le pack « ${pack.name} »`,
        approved: approve,
        reason: pack.rejectionReason,
        data: { packId: pack.id },
      })
    }
    return this.packView(pack)
  }

  // ===== PACKS =====

  /** A shop's packs, retired ones included (orders still quote them). */
  async listPacks(supplierId: string | null): Promise<PackView[]> {
    const packs = await this.em.find(ExportPack, { supplier: supplierId }, { orderBy: { createdAt: 'DESC' } })
    return this.packViews(packs)
  }

  /**
   * A shop composes from its own products only (EXPORT_PACK_FOREIGN_PRODUCT)
   * and waits for eBio; eBio composes across shops and its pack is live at
   * once. Every product must have asked for export.
   */
  async createPack(supplierId: string | null, input: ExportPackInput, actorUserId: string): Promise<PackView> {
    const pack = this.em.create(ExportPack, {
      supplier: supplierId ? this.em.getReference(Supplier, supplierId) : null,
      name: input.name,
      description: input.description ?? null,
      photos: input.photos,
      price: String(input.price),
      status: supplierId ? ExportPackStatus.PENDING : ExportPackStatus.APPROVED,
      reviewedBy: supplierId ? null : this.em.getReference(User, actorUserId),
      reviewedAt: supplierId ? null : new Date(),
    })
    await this.setItems(pack, supplierId, input.items)
    await this.em.flush()
    if (!supplierId) {
      await this.audit.record({ actorUserId, action: 'EXPORT_PACK_CREATED', targetType: 'export_pack', targetId: pack.id, payload: { name: pack.name, price: input.price } })
    }
    return this.packView(await this.loadPack(pack.id))
  }

  /** A shop's change goes back to eBio; eBio's own pack stays live. */
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
    if (supplierId) {
      pack.status = ExportPackStatus.PENDING
      pack.rejectionReason = null
    }
    await this.em.flush()
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
   * A pack can be ordered while it is approved and every product is approved
   * for export, on sale, approved by moderation and in stock for the pack
   * (FR-006).
   */
  isPackOrderable(pack: ExportPack, profiles: Map<string, ExportProfileStatus>): boolean {
    if (pack.status !== ExportPackStatus.APPROVED || pack.items.length === 0) {
      return false
    }
    return pack.items.getItems().every((item) => {
      const product = item.product
      const stock = item.variant && !item.variant.packSize ? item.variant.stock : product.stock
      return profiles.get(product.id) === ExportProfileStatus.APPROVED
        && product.status === ProductStatus.ACTIVE
        && product.moderationStatus === ProductModeration.APPROVED
        && stock >= (item.variant && !item.variant.packSize ? item.quantity : unitsDrawn(item))
    })
  }

  // ===== BUYERS ABROAD (US1) =====

  /**
   * The terroir catalogue (FR-007): approved products on sale, then the
   * orderable packs. Country-blind in v1 — both countries get the same
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
      { status: ExportProfileStatus.APPROVED, product },
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
      const where: Record<string, unknown> = { status: ExportPackStatus.APPROVED }
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
      { product: { id: productId, ...sellableProductFilter(), stock: { $gte: 0 } }, status: ExportProfileStatus.APPROVED },
      { populate: ['product', 'product.supplier', 'product.category'] },
    )
    if (!profile) {
      throw terroirError(HttpStatus.NOT_FOUND, 'TERROIR_PRODUCT_NOT_FOUND', 'Ce produit n\'est pas proposé à l\'étranger.')
    }
    const variants = await this.em.find(ProductVariant, { product: productId }, { orderBy: { pricePerUnit: 'ASC' } })
    return { profile, variants }
  }

  /** A pack's terroir page; 404 unless approved. Orderable or not, it says which. */
  async clientPack(packId: string): Promise<ClientPackView> {
    const pack = await this.loadPack(packId)
    if (pack.status !== ExportPackStatus.APPROVED) {
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
      { status: ExportProfileStatus.APPROVED, packedWeightG: { $lte: marginG }, product },
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
    const asked = new Set(profiles.filter(profile => profile.status !== ExportProfileStatus.REJECTED).map(profile => profile.product.id))

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

  private differs(profile: ExportProfile, values: Partial<ExportProfile>): boolean {
    return (Object.keys(values) as Array<keyof ExportProfile>).some((key) => {
      const before = profile[key]
      const after = values[key]
      return JSON.stringify(before ?? null) !== JSON.stringify(after ?? null)
    })
  }
}
