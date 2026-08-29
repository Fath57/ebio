/**
 * Canonical composition vocabularies. Products store these codes (never the
 * French labels) so that allergen/label filters stay exact and translatable.
 * The mobile app and the back-office carry their own display dictionaries;
 * this list is the source of truth enforced by the product contract.
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

/** French display names, used by the API for emails / admin exports. */
export const ALLERGEN_LABELS_FR: Record<AllergenCode, string> = {
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

export const LABEL_LABELS_FR: Record<LabelCode, string> = {
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
