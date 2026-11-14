import type { ExportCriterion, ExportCriterionKey, ExportPackCriterionKey } from './contracts/terroir.contract'
import { EXPORT_CRITERION_KEYS, EXPORT_PACK_CRITERION_KEYS, ExportPackStatus, ExportProfileStatus, ExportStorage } from './contracts/terroir.contract'

/** The settings the export criteria read. */
export interface ExportCriteriaSettings {
  bannedCategoryIds: string[]
  minShelfLifeDays: number
  maxUnitWeightG: number
}

/** The thresholds the criteria's wording quotes. */
export type ExportThresholds = Pick<ExportCriteriaSettings, 'minShelfLifeDays' | 'maxUnitWeightG'>

/** What a product's criteria are checked against: its export profile and its sheet. */
export interface ProfileFacts {
  categoryId: string
  /** Product sheet, « Composition et conservation ». */
  ingredients: string | null | undefined
  productAllergens: string[]
  packedWeightG: number | null | undefined
  shelfLifeDays: number | null | undefined
  storage: ExportStorage | null | undefined
  allergens: string | null | undefined
  noAllergens: boolean
  originProducer: string | null | undefined
  originPlace: string | null | undefined
  labelPhoto: string | null | undefined
  declaresFrenchLabel: boolean
  declaresDatesPrinted: boolean
  declaresSealedPackaging: boolean
}

interface CriterionText {
  label: string
  hint: string
}

function grams(value: number): string {
  return `${value.toLocaleString('fr-FR')} g`
}

/** The shop's wording of each criterion, with today's thresholds. */
export function profileCriterionTexts(settings: ExportThresholds): Record<ExportCriterionKey, CriterionText> {
  return {
    category_allowed: {
      label: 'Catégorie autorisée à l’export',
      hint: 'Les produits de cette catégorie ne peuvent pas voyager. Seuls les produits secs et stables partent à l’étranger.',
    },
    shelf_life: {
      label: `Conservation d’au moins ${settings.minShelfLifeDays} jours`,
      hint: `Indiquez la durée de conservation du produit : il faut au moins ${settings.minShelfLifeDays} jours pour le voyage et la vente.`,
    },
    storage_ambient: {
      label: 'Se conserve à température ambiante',
      hint: 'Indiquez comment le produit se conserve. Un produit à garder au frais ou surgelé ne peut pas voyager dans la valise.',
    },
    packed_weight: {
      label: `Poids emballé de ${grams(settings.maxUnitWeightG)} au plus`,
      hint: `Pesez une unité avec son emballage et indiquez son poids : ${grams(settings.maxUnitWeightG)} au plus.`,
    },
    ingredients: {
      label: 'Ingrédients renseignés',
      hint: 'Recopiez la liste des ingrédients de l’étiquette dans la fiche du produit (Composition et conservation).',
    },
    allergens: {
      label: 'Allergènes déclarés',
      hint: 'Indiquez les allergènes du produit, ou déclarez qu’il n’en contient aucun.',
    },
    origin: {
      label: 'Origine renseignée',
      hint: 'Indiquez le producteur et le lieu de fabrication du produit.',
    },
    label_photo: {
      label: 'Photo de l’étiquette',
      hint: 'Ajoutez une photo nette de l’étiquette, face avant et dates visibles.',
    },
    french_label: {
      label: 'Étiquette en français',
      hint: 'Confirmez que l’étiquette du produit est rédigée en français.',
    },
    dates_printed: {
      label: 'Dates imprimées sur l’emballage',
      hint: 'Confirmez que la date de fabrication et la date limite sont imprimées sur chaque unité.',
    },
    sealed_packaging: {
      label: 'Emballage scellé',
      hint: 'Confirmez que chaque unité est fermée hermétiquement et scellée.',
    },
  }
}

export const PACK_CRITERION_TEXTS: Record<ExportPackCriterionKey, CriterionText> = {
  products_exportable: {
    label: 'Tous les produits exportables',
    hint: 'Chaque produit du pack doit être exportable : complétez leur profil d’export ou retirez-les du pack.',
  },
  name: {
    label: 'Nom du pack',
    hint: 'Donnez un nom au pack.',
  },
  price: {
    label: 'Prix du pack',
    hint: 'Fixez le prix du pack.',
  },
  photo: {
    label: 'Photo du pack',
    hint: 'Ajoutez au moins une photo du pack.',
  },
}

function filled(value: string | null | undefined): boolean {
  return Boolean(value?.trim())
}

/** Keys of the criteria a product does not meet, in display order. */
export function unmetProfileCriteria(facts: ProfileFacts, settings: ExportCriteriaSettings): ExportCriterionKey[] {
  const met: Record<ExportCriterionKey, boolean> = {
    category_allowed: !settings.bannedCategoryIds.includes(facts.categoryId),
    shelf_life: (facts.shelfLifeDays ?? 0) >= settings.minShelfLifeDays,
    storage_ambient: facts.storage === ExportStorage.AMBIENT,
    packed_weight: (facts.packedWeightG ?? 0) > 0 && (facts.packedWeightG ?? 0) <= settings.maxUnitWeightG,
    ingredients: filled(facts.ingredients),
    allergens: facts.noAllergens || facts.productAllergens.length > 0 || filled(facts.allergens),
    origin: filled(facts.originProducer) && filled(facts.originPlace),
    label_photo: filled(facts.labelPhoto),
    french_label: facts.declaresFrenchLabel,
    dates_printed: facts.declaresDatesPrinted,
    sealed_packaging: facts.declaresSealedPackaging,
  }
  return EXPORT_CRITERION_KEYS.filter(key => !met[key])
}

/** The status a profile takes: eBio's withdrawal stands until it is lifted. */
export function profileStatusFor(current: ExportProfileStatus | null, unmet: readonly string[]): ExportProfileStatus {
  if (current === ExportProfileStatus.WITHDRAWN) {
    return ExportProfileStatus.WITHDRAWN
  }
  return unmet.length === 0 ? ExportProfileStatus.EXPORTABLE : ExportProfileStatus.INCOMPLETE
}

/** Same for packs; a pack its author retired stays retired. */
export function packStatusFor(current: ExportPackStatus | null, unmet: readonly string[]): ExportPackStatus {
  if (current === ExportPackStatus.WITHDRAWN || current === ExportPackStatus.RETIRED) {
    return current
  }
  return unmet.length === 0 ? ExportPackStatus.EXPORTABLE : ExportPackStatus.INCOMPLETE
}

/** Every criterion of a product, met or not, with the shop's wording. */
export function profileCriteria(unmet: readonly string[], settings: ExportThresholds): ExportCriterion[] {
  const texts = profileCriterionTexts(settings)
  return EXPORT_CRITERION_KEYS.map(key => ({ key, ...texts[key], met: !unmet.includes(key) }))
}

export function packCriteria(unmet: readonly string[]): ExportCriterion[] {
  return EXPORT_PACK_CRITERION_KEYS.map(key => ({ key, ...PACK_CRITERION_TEXTS[key], met: !unmet.includes(key) }))
}
