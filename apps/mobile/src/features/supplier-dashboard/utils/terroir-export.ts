import { colors } from '../../../theme/theme'
import { apiFetch } from '../../../utils/api-client'

export type ExportProfileStatus = 'EXPORTABLE' | 'INCOMPLETE' | 'WITHDRAWN'
export type ExportPackStatus = ExportProfileStatus | 'RETIRED'
export type ExportStorage = 'AMBIENT' | 'COOL' | 'FROZEN'

/** Every criterion a product must meet, in the order the API shows them. */
export const EXPORT_CRITERION_KEYS = [
  'category_allowed',
  'shelf_life',
  'storage_ambient',
  'packed_weight',
  'ingredients',
  'allergens',
  'origin',
  'label_photo',
  'french_label',
  'dates_printed',
  'sealed_packaging',
] as const

export type ExportCriterionKey = typeof EXPORT_CRITERION_KEYS[number]

export interface ExportCriterion {
  key: string
  label: string
  hint: string
  met: boolean
}

export interface ExportOrigin {
  producer: string | null
  place: string | null
  year: number | null
  method: string | null
  photos: string[]
}

export interface ExportProfile {
  status: ExportProfileStatus
  criteria: ExportCriterion[]
  missingCount: number
  withdrawnReason: string | null
  packedWeightG: number | null
  lengthCm: number | null
  widthCm: number | null
  heightCm: number | null
  shelfLifeDays: number | null
  storage: ExportStorage | null
  allergens: string | null
  noAllergens: boolean
  origin: ExportOrigin
  labelPhoto: string | null
  declaresFrenchLabel: boolean
  declaresDatesPrinted: boolean
  declaresSealedPackaging: boolean
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
  criteria: ExportCriterion[]
  missingCount: number
  withdrawnReason: string | null
  items: ExportPackItem[]
}

/** Today's thresholds and wording, from `GET /suppliers/me/export-criteria`. */
export interface ExportCriteriaGuide {
  minShelfLifeDays: number
  maxUnitWeightG: number
  bannedCategories: Array<{ slug: string, name: string }>
  criteria: Array<{ key: string, label: string, hint: string }>
}

export interface ExportStatusDisplay {
  label: string
  color: string
  background: string
  kind: 'exportable' | 'incomplete' | 'withdrawn' | 'retired'
}

/** Badge wording for a product profile or a pack, paired with an icon, never colour alone. */
export function describeExportStatus(status: ExportPackStatus): ExportStatusDisplay {
  switch (status) {
    case 'EXPORTABLE':
      return { label: 'Exportable', color: colors.green[800], background: colors.green[50], kind: 'exportable' }
    case 'WITHDRAWN':
      return { label: 'Retiré par eBio', color: colors.coral[800], background: colors.coral[50], kind: 'withdrawn' }
    case 'RETIRED':
      return { label: 'Archivé', color: colors.neutral[600], background: colors.neutral[100], kind: 'retired' }
    default:
      return { label: 'À compléter', color: colors.neutral[800], background: colors.neutral[100], kind: 'incomplete' }
  }
}

/**
 * A status as the API sends it. The values of the former manual review are
 * still read (an older server, a cached response) and mapped to the new ones.
 */
export function parseExportStatus(raw: unknown): ExportPackStatus | null {
  switch (raw) {
    case 'EXPORTABLE':
    case 'APPROVED':
      return 'EXPORTABLE'
    case 'INCOMPLETE':
    case 'PENDING':
      return 'INCOMPLETE'
    case 'WITHDRAWN':
    case 'REJECTED':
      return 'WITHDRAWN'
    case 'RETIRED':
      return 'RETIRED'
    default:
      return null
  }
}

export function parseProfileStatus(raw: unknown): ExportProfileStatus | null {
  const status = parseExportStatus(raw)
  return status === 'RETIRED' ? null : status
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asStorage(value: unknown): ExportStorage | null {
  return value === 'AMBIENT' || value === 'COOL' || value === 'FROZEN' ? value : null
}

/** Reads the untyped `criteria` array of a profile or a pack. */
export function parseCriteria(raw: unknown): ExportCriterion[] {
  if (!Array.isArray(raw))
    return []
  return (raw as unknown[])
    .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === 'object')
    .map(c => ({
      key: String(c.key ?? ''),
      label: String(c.label ?? ''),
      hint: String(c.hint ?? ''),
      met: c.met === true,
    }))
}

/** Reads the untyped `exportProfile` of a product or a PUT response; null when absent. */
export function parseExportProfile(raw: unknown): ExportProfile | null {
  if (!raw || typeof raw !== 'object')
    return null
  const data = raw as Record<string, unknown>
  const status = parseProfileStatus(data.status)
  if (!status)
    return null
  const origin = (data.origin && typeof data.origin === 'object' ? data.origin : {}) as Record<string, unknown>
  const criteria = parseCriteria(data.criteria)
  return {
    status,
    criteria,
    missingCount: asNumber(data.missingCount) ?? criteria.filter(c => !c.met).length,
    withdrawnReason: asText(data.withdrawnReason) ?? asText(data.rejectionReason),
    packedWeightG: asNumber(data.packedWeightG),
    lengthCm: asNumber(data.lengthCm),
    widthCm: asNumber(data.widthCm),
    heightCm: asNumber(data.heightCm),
    shelfLifeDays: asNumber(data.shelfLifeDays),
    storage: asStorage(data.storage),
    allergens: asText(data.allergens),
    noAllergens: data.noAllergens === true,
    origin: {
      producer: asText(origin.producer),
      place: asText(origin.place),
      year: asNumber(origin.year),
      method: asText(origin.method),
      photos: Array.isArray(origin.photos) ? origin.photos.filter((p): p is string => typeof p === 'string') : [],
    },
    labelPhoto: asText(data.labelPhoto),
    declaresFrenchLabel: data.declaresFrenchLabel === true,
    declaresDatesPrinted: data.declaresDatesPrinted === true,
    declaresSealedPackaging: data.declaresSealedPackaging === true,
  }
}

/** Reads the untyped pack list; tolerant of a `{ items }` envelope. */
export function parseExportPacks(raw: unknown): ExportPack[] {
  const list = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: unknown[] }).items : [])
  return (list as Array<Record<string, unknown>>).map((p) => {
    const criteria = parseCriteria(p.criteria)
    return {
      id: String(p.id),
      name: String(p.name ?? ''),
      description: typeof p.description === 'string' ? p.description : null,
      photos: Array.isArray(p.photos) ? (p.photos as unknown[]).filter((u): u is string => typeof u === 'string') : [],
      price: Number(p.price ?? 0),
      status: parseExportStatus(p.status) ?? 'INCOMPLETE',
      criteria,
      missingCount: asNumber(p.missingCount) ?? criteria.filter(c => !c.met).length,
      withdrawnReason: asText(p.withdrawnReason) ?? asText(p.rejectionReason),
      items: (Array.isArray(p.items) ? p.items as Array<Record<string, unknown>> : []).map(item => ({
        productId: String(item.productId),
        variantId: typeof item.variantId === 'string' ? item.variantId : null,
        quantity: Number(item.quantity ?? 1),
        name: String(item.name ?? ''),
        imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : null,
      })),
    }
  })
}

let guidePromise: Promise<ExportCriteriaGuide | null> | null = null

/**
 * Today's export thresholds and the criteria wording. Cached for the
 * session; a failed lookup is forgotten so the next call retries.
 */
export function loadExportCriteriaGuide(): Promise<ExportCriteriaGuide | null> {
  if (!guidePromise) {
    guidePromise = (async () => {
      const res = await apiFetch('/api/suppliers/me/export-criteria')
      if (!res.ok)
        return null
      const data = await res.json() as Record<string, unknown>
      const minShelfLifeDays = asNumber(data.minShelfLifeDays)
      const maxUnitWeightG = asNumber(data.maxUnitWeightG)
      if (minShelfLifeDays === null || maxUnitWeightG === null)
        return null
      const banned = Array.isArray(data.bannedCategories) ? data.bannedCategories as Array<Record<string, unknown>> : []
      return {
        minShelfLifeDays,
        maxUnitWeightG,
        bannedCategories: banned.map(c => ({ slug: String(c.slug ?? ''), name: String(c.name ?? '') })),
        criteria: parseCriteria(data.criteria).map(({ key, label, hint }) => ({ key, label, hint })),
      }
    })().catch(() => null)
    guidePromise.then((guide) => {
      if (!guide)
        guidePromise = null
    })
  }
  return guidePromise
}

/** « 1,5 kg » or « 800 g » from grams. */
export function formatWeight(grams: number): string {
  if (grams >= 1000)
    return `${(grams / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kg`
  return `${grams.toLocaleString('fr-FR')} g`
}

/** « Il vous manque 3 éléments » style counts. */
export function missingLabel(count: number): string {
  return count > 1 ? `${count} éléments` : `${count} élément`
}

/** What the form knows while the shop types, to mirror the API's criteria. */
export interface ProfileDraftFacts {
  categoryName: string | null
  /** Product sheet, « Composition et conservation ». */
  ingredients: string | null
  productAllergens: string[]
  packedWeightG: number | null
  shelfLifeDays: number | null
  storage: ExportStorage | null
  allergens: string
  noAllergens: boolean
  producer: string
  place: string
  labelPhoto: string | null
  declaresFrenchLabel: boolean
  declaresDatesPrinted: boolean
  declaresSealedPackaging: boolean
}

/** Wording used until the API's is known (offline, older server). */
const FALLBACK_TEXTS: Record<ExportCriterionKey, { label: string, hint: string }> = {
  category_allowed: { label: 'Catégorie autorisée à l’export', hint: 'Les produits de cette catégorie ne peuvent pas voyager. Seuls les produits secs et stables partent à l’étranger.' },
  shelf_life: { label: 'Conservation suffisante', hint: 'Indiquez la durée de conservation du produit.' },
  storage_ambient: { label: 'Se conserve à température ambiante', hint: 'Un produit à garder au frais ou surgelé ne peut pas voyager dans la valise.' },
  packed_weight: { label: 'Poids emballé renseigné', hint: 'Pesez une unité avec son emballage et indiquez son poids.' },
  ingredients: { label: 'Ingrédients renseignés', hint: 'Recopiez la liste des ingrédients de l’étiquette dans la fiche du produit (Composition et conservation).' },
  allergens: { label: 'Allergènes déclarés', hint: 'Indiquez les allergènes du produit, ou déclarez qu’il n’en contient aucun.' },
  origin: { label: 'Origine renseignée', hint: 'Indiquez le producteur et le lieu de fabrication du produit.' },
  label_photo: { label: 'Photo de l’étiquette', hint: 'Ajoutez une photo nette de l’étiquette, face avant et dates visibles.' },
  french_label: { label: 'Étiquette en français', hint: 'Confirmez que l’étiquette du produit est rédigée en français.' },
  dates_printed: { label: 'Dates imprimées sur l’emballage', hint: 'Confirmez que la date de fabrication et la date limite sont imprimées sur chaque unité.' },
  sealed_packaging: { label: 'Emballage scellé', hint: 'Confirmez que chaque unité est fermée hermétiquement et scellée.' },
}

function filled(value: string | null | undefined): boolean {
  return Boolean(value?.trim())
}

function sameName(a: string, b: string): boolean {
  return a.trim().localeCompare(b.trim(), 'fr', { sensitivity: 'base' }) === 0
}

/**
 * The product's criteria recomputed on the device as the shop types, with
 * the same rules as the API (`export-criteria.ts`). The server's last answer
 * settles what the device cannot know (thresholds missing, category). The
 * server stays the judge: its response replaces this after saving.
 */
export function computeProfileCriteria(
  facts: ProfileDraftFacts,
  guide: ExportCriteriaGuide | null,
  server: ExportCriterion[],
): ExportCriterion[] {
  const serverMet = new Map(server.map(c => [c.key, c.met]))
  const fallback = (key: ExportCriterionKey, local: boolean | null): boolean => local ?? serverMet.get(key) ?? false

  const categoryBanned = guide && facts.categoryName
    ? guide.bannedCategories.some(c => sameName(c.name, facts.categoryName ?? ''))
    : null
  const weight = facts.packedWeightG ?? 0
  const met: Record<ExportCriterionKey, boolean> = {
    category_allowed: categoryBanned === null ? (serverMet.get('category_allowed') ?? true) : !categoryBanned,
    shelf_life: fallback('shelf_life', guide ? (facts.shelfLifeDays ?? 0) >= guide.minShelfLifeDays : null),
    storage_ambient: facts.storage === 'AMBIENT',
    packed_weight: fallback('packed_weight', guide ? weight > 0 && weight <= guide.maxUnitWeightG : null),
    ingredients: filled(facts.ingredients),
    allergens: facts.noAllergens || facts.productAllergens.length > 0 || filled(facts.allergens),
    origin: filled(facts.producer) && filled(facts.place),
    label_photo: filled(facts.labelPhoto),
    french_label: facts.declaresFrenchLabel,
    dates_printed: facts.declaresDatesPrinted,
    sealed_packaging: facts.declaresSealedPackaging,
  }
  const guideTexts = new Map((guide?.criteria ?? []).map(c => [c.key, c]))
  const serverTexts = new Map(server.map(c => [c.key, c]))
  return EXPORT_CRITERION_KEYS.map((key) => {
    const text = guideTexts.get(key) ?? serverTexts.get(key) ?? FALLBACK_TEXTS[key]
    return { key, label: text.label, hint: text.hint, met: met[key] }
  })
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
  EXPORT_PACK_RETIRED: 'Ce pack est archivé : il ne peut plus être modifié.',
}

/** Readable message for a failed export call, known error codes first. */
export async function readExportError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null) as { code?: string, message?: string, aggregateErrors?: Array<{ message?: string }> } | null
  if (body?.code && ERROR_MESSAGES[body.code])
    return ERROR_MESSAGES[body.code]
  return body?.aggregateErrors?.[0]?.message ?? body?.message ?? 'Une erreur est survenue'
}

/** Export orders end when eBio collects them, not on a delivery. */
export const EXPORT_STATUS_LABELS: Record<string, string> = {
  READY: 'Prête pour la collecte',
  DELIVERED: 'Collectée par eBio',
}

const ORDER_ERROR_MESSAGES: Record<string, string> = {
  EXPORT_ORDER: 'Cette commande part à l’étranger avec eBio : vous pouvez seulement la préparer puis la marquer prête pour la collecte.',
}

/** Readable message for a refused order action, known error codes first. */
export async function readOrderError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null) as { code?: string, message?: string, aggregateErrors?: Array<{ message?: string }> } | null
  if (body?.code && ORDER_ERROR_MESSAGES[body.code])
    return ORDER_ERROR_MESSAGES[body.code]
  return body?.aggregateErrors?.[0]?.message ?? body?.message ?? fallback
}

/** « 18 novembre à 10:00 » for the collection deadline of an export order. */
export function formatCollectBefore(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime()))
    return ''
  const day = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return `${day} à ${time}`
}

/** Positive integer from a numeric field, null when empty or invalid. */
export function parsePositiveInt(text: string): number | null {
  const value = Number(text.trim())
  return text.trim() !== '' && Number.isInteger(value) && value > 0 ? value : null
}
