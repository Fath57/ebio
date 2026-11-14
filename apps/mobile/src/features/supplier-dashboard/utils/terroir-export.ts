import { colors } from '../../../theme/theme'
import { apiFetch } from '../../../utils/api-client'

export type ExportReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type ExportPackStatus = ExportReviewStatus | 'RETIRED'

export interface ExportOrigin {
  producer?: string | null
  place?: string | null
  year?: number | null
  method?: string | null
  photos: string[]
}

export interface ExportProfile {
  status: ExportReviewStatus
  rejectionReason: string | null
  packedWeightG: number
  lengthCm?: number | null
  widthCm?: number | null
  heightCm?: number | null
  shelfLifeDays: number
  origin: ExportOrigin
  labelPhoto: string | null
}

export interface ExportPackItem {
  productId: string
  variantId: string | null
  quantity: number
  name: string
  imageUrl: string | null
}

export interface ExportPack {
  id: string
  name: string
  description: string | null
  photos: string[]
  price: number
  status: ExportPackStatus
  rejectionReason: string | null
  items: ExportPackItem[]
}

export interface ExportStatusDisplay {
  label: string
  color: string
  background: string
  kind: 'pending' | 'approved' | 'rejected' | 'retired'
}

/** Badge wording for a product profile or a pack — paired with an icon, never colour alone. */
export function describeExportStatus(status: ExportPackStatus): ExportStatusDisplay {
  switch (status) {
    case 'APPROVED':
      return { label: 'Validé pour l\'export', color: colors.green[800], background: colors.green[50], kind: 'approved' }
    case 'REJECTED':
      return { label: 'Refusé', color: colors.coral[800], background: colors.coral[50], kind: 'rejected' }
    case 'RETIRED':
      return { label: 'Retiré', color: colors.neutral[600], background: colors.neutral[100], kind: 'retired' }
    default:
      return { label: 'En attente de validation', color: colors.earth[800], background: colors.earth[50], kind: 'pending' }
  }
}

let supplierIdPromise: Promise<string | null> | null = null

/**
 * The shop's real id, for the `/suppliers/:supplierId/…` routes. Cached for
 * the session; a failed lookup is forgotten so the next call retries.
 */
export function resolveSupplierId(): Promise<string | null> {
  if (!supplierIdPromise) {
    supplierIdPromise = (async () => {
      const res = await apiFetch('/api/suppliers/me/status')
      if (!res.ok)
        return null
      const status = await res.json() as { supplierId?: string }
      return status.supplierId ?? null
    })().catch(() => null)
    supplierIdPromise.then((id) => {
      if (!id)
        supplierIdPromise = null
    })
  }
  return supplierIdPromise
}

const ERROR_MESSAGES: Record<string, string> = {
  EXPORT_CATEGORY_BANNED: 'Cette catégorie de produit ne peut pas être envoyée à l\'étranger (produits frais, viande, lait, plantes vivantes…).',
  EXPORT_PACK_FOREIGN_PRODUCT: 'Un pack ne peut contenir que les produits de votre boutique.',
}

/** Readable message for a failed export call, known error codes first. */
export async function readExportError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null) as { code?: string, message?: string, aggregateErrors?: Array<{ message?: string }> } | null
  if (body?.code && ERROR_MESSAGES[body.code])
    return ERROR_MESSAGES[body.code]
  return body?.aggregateErrors?.[0]?.message ?? body?.message ?? 'Une erreur est survenue'
}

/** Positive integer from a numeric field, null when empty or invalid. */
export function parsePositiveInt(text: string): number | null {
  const value = Number(text.trim())
  return text.trim() !== '' && Number.isInteger(value) && value > 0 ? value : null
}
