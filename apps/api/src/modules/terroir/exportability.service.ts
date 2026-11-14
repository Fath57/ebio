import type { ExportCountry } from './entities/export-country.entity'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'
import { ProductModeration, ProductStatus } from '../products/entities/product.entity'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { SupplierMode, ValidationStatus } from '../suppliers/supplier.entity'
import { ExportabilityStatus, ExportProfileStatus } from './contracts/terroir.contract'
import { ExportCountriesService } from './export-countries.service'

/** What « mode Valise » shows of one product. */
export interface ProductExportability {
  productId: string
  status: ExportabilityStatus
  label: string
  reason: string | null
  packedWeightG: number | null
}

export interface ExportabilityResult {
  country: ExportCountry
  items: ProductExportability[]
}

interface ExportabilityRow {
  id: string
  status: string
  moderation_status: string
  stock: number
  category_id: string
  validation_status: string
  mode: string
  profile_status: string | null
  packed_weight_g: number | null
}

/** The buyer's wording of each status: never eBio's internal rejection note. */
const TEXTS: Record<ExportabilityStatus, { label: string, reason: string | null }> = {
  [ExportabilityStatus.EXPORTABLE]: { label: 'Exportable', reason: null },
  [ExportabilityStatus.NOT_REQUESTED]: { label: 'Non exportable', reason: 'Cette boutique ne propose pas encore ce produit à l’export.' },
  [ExportabilityStatus.PENDING]: { label: 'Bientôt exportable', reason: 'eBio vérifie ce produit pour l’export.' },
  [ExportabilityStatus.REJECTED]: { label: 'Non exportable', reason: 'Ce produit ne peut pas voyager (contrôle eBio).' },
  [ExportabilityStatus.BANNED_CATEGORY]: { label: 'Non exportable', reason: 'Cette catégorie de produits ne peut pas être envoyée à l’étranger.' },
  [ExportabilityStatus.UNAVAILABLE]: { label: 'Indisponible', reason: 'Ce produit n’est plus disponible pour le moment.' },
}

/** Banned category first, then the shop's request and eBio's answer, then today's availability. */
function statusOf(row: ExportabilityRow, banned: Set<string>): ExportabilityStatus {
  if (banned.has(row.category_id)) {
    return ExportabilityStatus.BANNED_CATEGORY
  }
  if (!row.profile_status) {
    return ExportabilityStatus.NOT_REQUESTED
  }
  if (row.profile_status === ExportProfileStatus.PENDING) {
    return ExportabilityStatus.PENDING
  }
  if (row.profile_status === ExportProfileStatus.REJECTED) {
    return ExportabilityStatus.REJECTED
  }
  // Same rule as the terroir catalogue: on sale, in stock, from a live shop.
  const onSale = row.status === ProductStatus.ACTIVE
    && row.moderation_status === ProductModeration.APPROVED
    && Number(row.stock) > 0
    && row.validation_status === ValidationStatus.VALIDATED
    && row.mode === SupplierMode.ORDER
  return onSale ? ExportabilityStatus.EXPORTABLE : ExportabilityStatus.UNAVAILABLE
}

/**
 * Whether products of the whole eBio catalogue can go in the suitcase
 * (« mode Valise »). Country-blind in v1 like the terroir catalogue: the
 * country is only checked to exist and be open. One query for the products,
 * whatever their number; the banned categories come from the settings cache.
 */
@Injectable()
export class ExportabilityService {
  constructor(
    private readonly em: EntityManager,
    private readonly platformSettings: PlatformSettingsService,
    private readonly countries: ExportCountriesService,
  ) {}

  /** 400 `EXPORT_COUNTRY_UNKNOWN` / 409 `EXPORT_COUNTRY_INACTIVE`, as the catalogue. */
  async forProducts(countryCode: string, productIds: string[]): Promise<ExportabilityResult> {
    const country = await this.countries.requireActive(countryCode)
    return { country, items: await this.ofProducts(productIds) }
  }

  /**
   * For a product page: never throws, null when terroir is switched off or
   * the country is unknown or closed (the page must still open).
   */
  async forProduct(countryCode: string, productId: string): Promise<ProductExportability | null> {
    if (!await this.platformSettings.getTerroirExportEnabled()) {
      return null
    }
    const country = await this.countries.find(countryCode)
    if (!country?.isActive) {
      return null
    }
    const [item] = await this.ofProducts([productId])
    return item ?? null
  }

  /** Country-blind (as the terroir catalogue in v1), in the order asked, unknown ids left out. */
  async ofProducts(productIds: string[]): Promise<ProductExportability[]> {
    const ids = [...new Set(productIds.map(id => id.toLowerCase()))]
    if (ids.length === 0) {
      return []
    }
    const rows = await this.em.execute<ExportabilityRow[]>(
      `SELECT p.id, p.status, p.moderation_status, p.stock, p.category_id,
              s.validation_status, s.mode,
              ep.status AS profile_status, ep.packed_weight_g
       FROM products p
       JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN export_profiles ep ON ep.product_id = p.id
       WHERE p.id IN (${ids.map(() => '?').join(', ')})`,
      ids,
    )
    const { bannedCategoryIds } = await this.platformSettings.getTerroirExportSettings()
    const banned = new Set(bannedCategoryIds)
    const byId = new Map(rows.map(row => [row.id, row]))
    return ids.flatMap((id) => {
      const row = byId.get(id)
      if (!row) {
        return []
      }
      const status = statusOf(row, banned)
      return [{
        productId: row.id,
        status,
        ...TEXTS[status],
        packedWeightG: status === ExportabilityStatus.EXPORTABLE ? row.packed_weight_g : null,
      }]
    })
  }
}
