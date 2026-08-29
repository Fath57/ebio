/**
 * Product composition vocabularies, mirrored from the API
 * (apps/api/src/modules/products/composition.constants.ts). Products carry
 * canonical codes; this module is the mobile display dictionary.
 */

/** The 14 allergens of EU regulation 1169/2011, annex II. */
export const ALLERGEN_CODES = [
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'peanuts',
  'soy',
  'milk',
  'nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'molluscs',
] as const

export type AllergenCode = typeof ALLERGEN_CODES[number]

/** Quality / certification labels a supplier can claim on a product. */
export const LABEL_CODES = [
  'organic',
  'ecocert',
  'local',
  'fair-trade',
  'gmo-free',
  'handmade',
  'artisanal',
  'vegan',
  'vegetarian',
  'gluten-free',
  'lactose-free',
  'sugar-free',
] as const

export type LabelCode = typeof LABEL_CODES[number]

export const ALLERGEN_LABELS: Record<AllergenCode, string> = {
  gluten: 'Gluten',
  crustaceans: 'Crustacés',
  eggs: 'Œufs',
  fish: 'Poissons',
  peanuts: 'Arachides',
  soy: 'Soja',
  milk: 'Lait',
  nuts: 'Fruits à coque',
  celery: 'Céleri',
  mustard: 'Moutarde',
  sesame: 'Sésame',
  sulphites: 'Sulfites',
  lupin: 'Lupin',
  molluscs: 'Mollusques',
}

export const LABEL_LABELS: Record<LabelCode, string> = {
  'organic': 'Bio',
  'ecocert': 'Ecocert',
  'local': 'Agriculture locale',
  'fair-trade': 'Commerce équitable',
  'gmo-free': 'Sans OGM',
  'handmade': 'Fait main',
  'artisanal': 'Artisanal',
  'vegan': 'Végan',
  'vegetarian': 'Végétarien',
  'gluten-free': 'Sans gluten',
  'lactose-free': 'Sans lactose',
  'sugar-free': 'Sans sucre ajouté',
}

function isAllergenCode(value: string): value is AllergenCode {
  return (ALLERGEN_CODES as readonly string[]).includes(value)
}

function isLabelCode(value: string): value is LabelCode {
  return (LABEL_CODES as readonly string[]).includes(value)
}

/** French label for an allergen code; unknown/legacy values are shown as-is. */
export function allergenLabel(code: string): string {
  return isAllergenCode(code) ? ALLERGEN_LABELS[code] : code
}

/** French label for a quality label code; unknown/legacy values are shown as-is. */
export function labelLabel(code: string): string {
  return isLabelCode(code) ? LABEL_LABELS[code] : code
}

export const NUTRITION_BASES = ['100g', '100ml'] as const

export type NutritionBasis = typeof NUTRITION_BASES[number]

export const NUTRITION_BASIS_LABELS: Record<NutritionBasis, string> = {
  '100g': 'pour 100 g',
  '100ml': 'pour 100 ml',
}

/** Display label for a basis, defaulting to 100 g when absent or unknown. */
export function nutritionBasisLabel(basis: string | null | undefined): string {
  return basis === '100ml' ? NUTRITION_BASIS_LABELS['100ml'] : NUTRITION_BASIS_LABELS['100g']
}
