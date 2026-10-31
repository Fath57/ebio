import type { AllergenCode, NutritionalValues } from '@boilerstone/openapi-generator/client/types.gen'
import type { TFunction } from 'i18next'
import { AllergenCode as AllergenCodeEnum } from '@boilerstone/openapi-generator/client/types.gen'

/**
 * Canonical composition vocabularies, derived from the generated SDK so the
 * back-office can never drift from what the API contract accepts.
 * The tuple casts let zod build `z.enum()` from them.
 */
export const ALLERGEN_CODES = Object.values(AllergenCodeEnum) as [AllergenCode, ...AllergenCode[]]

export type NutritionBasis = NutritionalValues['basis']
export const NUTRITION_BASES = ['100g', '100ml'] as const satisfies readonly NutritionBasis[]
export const DEFAULT_NUTRITION_BASIS: NutritionBasis = '100g'

export function isAllergenCode(value: string): value is AllergenCode {
  return (ALLERGEN_CODES as readonly string[]).includes(value)
}

/** Translated allergen name; legacy free-text values are returned untouched. */
export function allergenName(t: TFunction, code: string): string {
  return isAllergenCode(code) ? t(`catalog.composition.allergenNames.${code}`) : code
}

/**
 * Name of a label: the back-office catalogue first (`names`, from
 * `useCertifications`), then the built-in translation of the original list,
 * then the code itself.
 */
export function labelName(t: TFunction, code: string, names?: ReadonlyMap<string, string>): string {
  return names?.get(code) ?? t(`catalog.composition.labelNames.${code}`, { defaultValue: code })
}

/** Basis actually carried by the data, falling back for records saved before the field existed. */
export function nutritionBasisOf(values: Partial<NutritionalValues> | null | undefined): NutritionBasis {
  return values?.basis ?? DEFAULT_NUTRITION_BASIS
}

/** « 100 g » / « 100 ml » */
export function basisName(t: TFunction, basis: NutritionBasis): string {
  return t(`catalog.composition.basis.${basis}`)
}

/** « Pour 100 g » / « Pour 100 ml » */
export function nutritionPerBasis(t: TFunction, basis: NutritionBasis): string {
  return t('catalog.composition.nutrition.per', { basis: basisName(t, basis) })
}
