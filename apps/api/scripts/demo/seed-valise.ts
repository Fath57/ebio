/**
 * « La Valise du pays » (011) in the demo: destination countries, a partner
 * agency and its open departure, the eBio hub, and the export profiles of the
 * shops' dry products. Called by seed-demo.ts once the catalogue is loaded.
 *
 * The agency, its pickup points and the hub are fictitious. Statuses are
 * computed by the API's own criteria (export-criteria.ts), with the default
 * thresholds written below, so the API's recomputation at boot finds nothing
 * to change.
 */
import type { EntityManager } from '@mikro-orm/postgresql'
import type { ExportCriteriaSettings } from '../../src/modules/terroir/export-criteria'
import { ExportStorage } from '../../src/modules/terroir/contracts/terroir.contract'
import { profileStatusFor, unmetProfileCriteria } from '../../src/modules/terroir/export-criteria'

/** Name the reset script re-anchors the departure dates by. */
export const DEMO_AGENCY_NAME = 'Atlantique Fret'

/** Same as the API defaults: nothing banned, 90 days, 5 kg a unit. */
const CRITERIA: ExportCriteriaSettings = { bannedCategoryIds: [], minShelfLifeDays: 90, maxUnitWeightG: 5_000 }

/** The eBio hub couriers bring terroir orders to: Gbégamey, 3 km from FARINE TADAGBE. */
const HUB = {
  name: 'Point eBio Cotonou',
  address: 'Rue de la pharmacie Gbégamey, Cotonou',
  latitude: 6.3690,
  longitude: 2.4180,
  phone: '+2290100000003',
  hours: 'Du lundi au samedi, 8 h à 18 h',
}

const TERROIR_SETTINGS: Record<string, string> = {
  terroir_export_enabled: 'true',
  export_packaging_weight_g: '300',
  export_collection_days: '3',
  export_weight_tolerance_pct: '10',
  export_insurance_rate_bps: '300',
  export_insurance_min: '1000',
  export_banned_category_ids: '[]',
  export_pickup_reminder_days: '14',
  export_min_shelf_life_days: String(CRITERIA.minShelfLifeDays),
  export_max_unit_weight_g: String(CRITERIA.maxUnitWeightG),
  export_collection_mode: 'COURIER',
  export_hub_name: HUB.name,
  export_hub_address: HUB.address,
  export_hub_lat: String(HUB.latitude),
  export_hub_lng: String(HUB.longitude),
  export_hub_phone: HUB.phone,
  export_hub_hours: HUB.hours,
}

interface CountrySpec {
  code: string
  name: string
  to: string
  in: string
  flag: string
  sortOrder: number
  pricePerKg: number
  homeDeliveryFee: number | null
  points: Array<{ city: string, address: string, hours: string }>
}

const COUNTRIES: CountrySpec[] = [
  {
    code: 'FR',
    name: 'France',
    to: 'vers la France',
    in: 'en France',
    flag: '🇫🇷',
    sortOrder: 10,
    pricePerKg: 8_500,
    homeDeliveryFee: 3_900,
    points: [{ city: 'Paris', address: '14 rue des Envierges, 75020 Paris', hours: 'Du mardi au samedi, 10 h à 19 h' }],
  },
  {
    code: 'BE',
    name: 'Belgique',
    to: 'vers la Belgique',
    in: 'en Belgique',
    flag: '🇧🇪',
    sortOrder: 20,
    pricePerKg: 9_000,
    homeDeliveryFee: null,
    points: [{ city: 'Bruxelles', address: '27 chaussée de Wavre, 1050 Ixelles', hours: 'Du mercredi au samedi, 11 h à 18 h' }],
  },
]

interface ProfileSpec {
  shop: string
  product: string
  packedWeightG: number
  shelfLifeDays: number
  size: [number, number, number]
  /** Written on the product sheet when it has none (the criterion reads it). */
  ingredients?: string
  allergens?: string
  /** The one profile the supplier video completes on camera. */
  incomplete?: true
}

const PLACES: Record<string, string> = {
  'FARINE TADAGBE': 'Togba, Abomey-Calavi',
  'Naturo': 'Lokossa, Mono',
  'Mine d\'or délice': 'Aïtchédji, Abomey-Calavi',
  'Mandagbe': 'Togoudo, Abomey-Calavi',
}

const METHODS: Record<string, string> = {
  'FARINE TADAGBE': 'Souchet lavé, séché au soleil puis moulu sur place',
  'Naturo': 'Céréales triées, séchées et moulues à l’atelier',
  'Mine d\'or délice': 'Miel récolté et filtré à froid',
  'Mandagbe': 'Légumes feuilles séchés à l’ombre puis conditionnés',
}

/**
 * Dry, shelf-stable products only. The fresh juices of Mine d'or délice and
 * the precooked or fresh vegetables of Mandagbe get no profile: « Non
 * exportable » in the Valise mode.
 */
const PROFILES: ProfileSpec[] = [
  { shop: 'FARINE TADAGBE', product: 'FARINE DE SOUCHET NATURE', packedWeightG: 520, shelfLifeDays: 180, size: [20, 13, 6] },
  { shop: 'FARINE TADAGBE', product: 'FARINE DE SOUCHET AU CURCUMA', packedWeightG: 520, shelfLifeDays: 180, size: [20, 13, 6] },
  { shop: 'FARINE TADAGBE', product: 'FARINE DE SOUCHET AU GENGEMBRE', packedWeightG: 520, shelfLifeDays: 180, size: [20, 13, 6] },
  { shop: 'FARINE TADAGBE', product: 'FARINE DE SOUCHET AU PETIT COLA', packedWeightG: 520, shelfLifeDays: 180, size: [20, 13, 6] },
  { shop: 'FARINE TADAGBE', product: 'FARINE DE SOUCHET À LA CANNELLE', packedWeightG: 520, shelfLifeDays: 180, size: [20, 13, 6] },
  { shop: 'FARINE TADAGBE', product: 'FARINE DE SOUCHET AU CLOU DE GIROFLE', packedWeightG: 520, shelfLifeDays: 180, size: [20, 13, 6], incomplete: true },
  { shop: 'FARINE TADAGBE', product: 'POUDRE DE BAOBAB', packedWeightG: 300, shelfLifeDays: 365, size: [16, 11, 5] },
  { shop: 'FARINE TADAGBE', product: 'BISCUITS DE SOUCHET 80G', packedWeightG: 1_100, shelfLifeDays: 120, size: [30, 20, 10], allergens: 'Œufs, lait (beurre)' },
  { shop: 'FARINE TADAGBE', product: 'BISCUITS DE SOUCHET À LA CANNELLE (sans sucre)', packedWeightG: 250, shelfLifeDays: 120, size: [18, 10, 5] },
  { shop: 'Naturo', product: 'Naturo mawè', packedWeightG: 520, shelfLifeDays: 120, size: [20, 13, 6], ingredients: 'Pâte de maïs fermentée, séchée' },
  { shop: 'Naturo', product: 'Farine d\'akassa', packedWeightG: 520, shelfLifeDays: 180, size: [20, 13, 6], ingredients: 'Maïs fermenté, séché et moulu' },
  { shop: 'Naturo', product: 'Farine de kom', packedWeightG: 520, shelfLifeDays: 180, size: [20, 13, 6], ingredients: 'Maïs fermenté, séché et moulu' },
  { shop: 'Naturo', product: 'Farine d\'amiwor', packedWeightG: 520, shelfLifeDays: 180, size: [20, 13, 6], ingredients: 'Farine de maïs, piment, sel' },
  { shop: 'Naturo', product: 'Naturo  Farine d\'harico', packedWeightG: 520, shelfLifeDays: 180, size: [20, 13, 6], ingredients: 'Haricot niébé décortiqué et moulu' },
  { shop: 'Naturo', product: 'Naturo adowè grain', packedWeightG: 520, shelfLifeDays: 365, size: [20, 13, 6], ingredients: 'Haricot adowè trié et séché' },
  { shop: 'Naturo', product: 'Naturo aklui maïs', packedWeightG: 1_050, shelfLifeDays: 180, size: [25, 15, 8], ingredients: 'Maïs grillé et concassé' },
  { shop: 'Naturo', product: 'Aklui maïs', packedWeightG: 520, shelfLifeDays: 180, size: [20, 13, 6], ingredients: 'Maïs grillé et concassé' },
  { shop: 'Mandagbe', product: 'Tchayo séchés', packedWeightG: 150, shelfLifeDays: 180, size: [20, 15, 5] },
  { shop: 'Mandagbe', product: 'Amanvivè séchés', packedWeightG: 150, shelfLifeDays: 180, size: [20, 15, 5] },
  { shop: 'Mandagbe', product: 'Poudre de gombo', packedWeightG: 120, shelfLifeDays: 365, size: [15, 10, 4] },
  { shop: 'Mine d\'or délice', product: 'Miel', packedWeightG: 1_450, shelfLifeDays: 730, size: [12, 12, 18], ingredients: 'Miel pur de fleurs' },
]

/** FARINE TADAGBE's pack: three flours at a round price, below their sum (4 800). */
const PACK = {
  shop: 'FARINE TADAGBE',
  name: 'Trio de farines de souchet',
  description: 'Trois farines de souchet de Togba, nature, curcuma et gingembre : le goût du pays pour les bouillies et les pâtisseries.',
  price: 4_500,
  products: ['FARINE DE SOUCHET NATURE', 'FARINE DE SOUCHET AU CURCUMA', 'FARINE DE SOUCHET AU GENGEMBRE'],
}

interface ProductRow {
  id: string
  category_id: string
  ingredients: string | null
  allergens: string[] | null
  photos: string[] | null
}

async function findProduct(em: EntityManager, shop: string, name: string): Promise<ProductRow> {
  const [row] = await em.getConnection().execute<ProductRow[]>(
    `SELECT p.id, p.category_id, p.ingredients, p.allergens, p.photos
     FROM products p JOIN suppliers s ON s.id = p.supplier_id
     WHERE s.shop_name = ? AND p.name = ?`,
    [shop, name],
  )
  if (!row) {
    throw new Error(`${name} not found at ${shop}`)
  }
  return row
}

/**
 * The departure leaves 12 days from `now`, deposit at the agency 9 days from
 * now, so orders close 6 days from now (minus the 3 collection days).
 * reset-demo.sh re-anchors the same dates on the day of the take.
 */
async function seedDeparture(em: EntityManager): Promise<void> {
  const db = em.getConnection()
  const [agency] = await db.execute<Array<{ id: string }>>(
    `INSERT INTO export_agencies (name, contact_name, contact_phone, contact_email, notes, active, created_at, updated_at)
     VALUES (?, 'Mathieu Adjovi', '+2290100000004', 'contact@atlantique-fret.demo.e-bio.org', 'Agence fictive de la démo, droits et taxes inclus.', true, NOW(), NOW())
     RETURNING id`,
    [DEMO_AGENCY_NAME],
  )
  const [departure] = await db.execute<Array<{ id: string }>>(
    `INSERT INTO export_departures (agency_id, departs_on, deposit_deadline, transit_min_days, transit_max_days, capacity_kg, status, created_at, updated_at)
     VALUES (?, CURRENT_DATE + 12, date_trunc('day', NOW()) + INTERVAL '9 days 17 hours', 5, 8, 120, 'OPEN', NOW(), NOW())
     RETURNING id`,
    [agency.id],
  )
  for (const country of COUNTRIES) {
    await db.execute(
      `INSERT INTO export_countries (code, name, to_phrase, in_phrase, display_currency, flag_emoji, sort_order, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'EUR', ?, ?, true, NOW(), NOW())
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, to_phrase = EXCLUDED.to_phrase, in_phrase = EXCLUDED.in_phrase,
         flag_emoji = EXCLUDED.flag_emoji, sort_order = EXCLUDED.sort_order, is_active = true`,
      [country.code, country.name, country.to, country.in, country.flag, country.sortOrder],
    )
    for (const point of country.points) {
      await db.execute(
        `INSERT INTO export_pickup_points (agency_id, country, city, address, opening_hours, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, true, NOW(), NOW())`,
        [agency.id, country.code, point.city, point.address, point.hours],
      )
    }
    await db.execute(
      `INSERT INTO export_departure_rates (departure_id, country, price_per_kg, min_billed_kg, max_weight_kg, home_delivery_fee)
       VALUES (?, ?, ?, 5, 30, ?)`,
      [departure.id, country.code, country.pricePerKg, country.homeDeliveryFee],
    )
  }
}

async function seedProfiles(em: EntityManager): Promise<void> {
  const db = em.getConnection()
  for (const spec of PROFILES) {
    const product = await findProduct(em, spec.shop, spec.product)
    let ingredients = product.ingredients
    if (!ingredients?.trim() && spec.ingredients) {
      ingredients = spec.ingredients
      await db.execute(`UPDATE products SET ingredients = ? WHERE id = ?`, [ingredients, product.id])
    }
    const productAllergens = product.allergens ?? []
    const facts = {
      categoryId: product.category_id,
      ingredients,
      productAllergens,
      packedWeightG: spec.packedWeightG,
      shelfLifeDays: spec.shelfLifeDays,
      storage: spec.incomplete ? null : ExportStorage.AMBIENT,
      allergens: spec.allergens ?? null,
      noAllergens: !spec.allergens && productAllergens.length === 0,
      originProducer: spec.shop,
      originPlace: PLACES[spec.shop],
      labelPhoto: spec.incomplete ? null : product.photos?.[0] ?? null,
      declaresFrenchLabel: true,
      declaresDatesPrinted: true,
      declaresSealedPackaging: true,
    }
    const unmet = unmetProfileCriteria(facts, CRITERIA)
    const status = profileStatusFor(null, unmet)
    if (Boolean(spec.incomplete) !== (unmet.length > 0)) {
      throw new Error(`${spec.product}: expected ${spec.incomplete ? 'incomplete' : 'exportable'}, missing ${unmet.join(', ') || 'nothing'}`)
    }
    const [length, width, height] = spec.size
    // exportable_since set: the API's recomputation at boot sends no « Produit exportable » news.
    await db.execute(
      `INSERT INTO export_profiles (product_id, status, missing_criteria, packed_weight_g, length_cm, width_cm, height_cm, shelf_life_days,
         storage, allergens, no_allergens, origin_producer, origin_place, origin_year, origin_method, origin_photos, label_photo,
         declares_french_label, declares_dates_printed, declares_sealed_packaging, exportable_since, created_at, updated_at)
       VALUES (?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2026, ?, '[]'::jsonb, ?, true, true, true, ?, NOW(), NOW())`,
      [product.id, status, JSON.stringify(unmet), facts.packedWeightG, length, width, height, facts.shelfLifeDays, facts.storage, facts.allergens, facts.noAllergens, facts.originProducer, facts.originPlace, METHODS[spec.shop], facts.labelPhoto, unmet.length === 0 ? new Date() : null],
    )
  }
}

async function seedPack(em: EntityManager): Promise<void> {
  const db = em.getConnection()
  const products = await Promise.all(PACK.products.map(name => findProduct(em, PACK.shop, name)))
  const [pack] = await db.execute<Array<{ id: string }>>(
    `INSERT INTO export_packs (supplier_id, name, description, photos, price, status, missing_criteria, created_at, updated_at)
     SELECT id, ?, ?, ?::jsonb, ?, 'EXPORTABLE', '[]'::jsonb, NOW(), NOW() FROM suppliers WHERE shop_name = ?
     RETURNING id`,
    [PACK.name, PACK.description, JSON.stringify([products[0].photos?.[0]].filter(Boolean)), PACK.price, PACK.shop],
  )
  for (const product of products) {
    await db.execute(`INSERT INTO export_pack_items (pack_id, product_id, quantity) VALUES (?, ?, 1)`, [pack.id, product.id])
  }
}

/** Countries, agency, departure, hub, profiles and pack: the Valise ready to film. */
export async function seedValise(em: EntityManager): Promise<void> {
  for (const [key, value] of Object.entries(TERROIR_SETTINGS)) {
    await em.getConnection().execute(
      `INSERT INTO platform_settings (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value],
    )
  }
  await seedDeparture(em)
  await seedProfiles(em)
  await seedPack(em)
  const exportable = PROFILES.filter(spec => !spec.incomplete).length
  console.info(`valise: FR and BE, 1 open departure, ${exportable} products exportable, 1 to complete, 1 pack`)
}
