import type { OpeningHours } from '../../common/opening-hours'
import type { SearchProductsQuery, SearchResponse, SearchResult } from './contracts/search.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'
import { thumbnailUrlFor } from '../../common/media-urls'
import { isOpenNow } from '../../common/opening-hours'

interface RawSearchRow {
  product_id: string
  product_name: string
  photos: string[]
  price_per_unit: number
  unit: string
  stock: number
  promotional_price: number | null
  rating_avg: number | null
  rating_count: number
  promotion_types: string[] | null
  supplier_id: string
  shop_name: string
  latitude: number | null
  longitude: number | null
  mode: 'CONTACT' | 'ORDER'
  global_rating: number | null
  total_reviews: number
  validation_status: string
  opening_hours: OpeningHours
  timezone: string
  distance: number
}

/** Rayon appliqué quand la requête est géolocalisée sans rayon explicite. */
const DEFAULT_RADIUS_METERS = 50_000

/**
 * The discount mirrored onto the product, while it runs. A null bound is an
 * open one: no start means it applies at once, no end means it never expires.
 */
const LIVE_LEGACY_PROMO = `
  p.promotional_price IS NOT NULL
  AND (p.promotion_starts_at IS NULL OR p.promotion_starts_at <= NOW())
  AND (p.promotion_expires_at IS NULL OR p.promotion_expires_at > NOW())
`.trim()

/** A running row of `product_promotions`, whatever its type. */
const LIVE_PROMOTION_ROW = `
  SELECT 1 FROM product_promotions pp
  WHERE pp.product_id = p.id AND pp.is_active = true
    AND pp.starts_at <= NOW() AND (pp.ends_at IS NULL OR pp.ends_at > NOW())
`.trim()

interface RawCountRow {
  count: string
}

interface RawAutocompleteRow {
  text: string
  type: 'product' | 'category' | 'supplier'
  id: string | null
}

interface RawCategoryRow {
  id: string
  name: string
  slug: string
  image_url: string | null
  product_count: string
}

/** French words whose final -s or -x belongs to the singular. */
const INVARIABLE = /(?:ais|ois|as|os|us|ix)$/i

/**
 * What people say here, for what the catalogue calls something else.
 *
 * "de l'huile rouge" is palm oil in Benin, and no product carries the word
 * "rouge". Substituted on the whole query, before it is split, because the
 * meaning is in the pair of words and not in either one.
 *
 * Deliberately short: a guessed synonym silently sends the buyer elsewhere.
 * It grows from what buyers actually ask for.
 */
const LOCAL_SYNONYMS: [RegExp, string][] = [
  [/\bhuiles?\s+rouges?\b/gi, 'huile de palme'],
]

/**
 * Linking words, dropped.
 *
 * Every term is required in the name, so keeping "avec" from "du gari avec de
 * l'huile" demands that the product be named "avec" — nothing matches.
 */
const STOPWORDS = new Set([
  'au',
  'aux',
  'avec',
  'de',
  'des',
  'du',
  'en',
  'et',
  'la',
  'le',
  'les',
  'ou',
  'pour',
  'un',
  'une',
])

/**
 * The words of a quantity, dropped as well.
 *
 * The assistant searched "tomate 2 kg" and returned nothing, while the
 * catalogue carries "Tomates fraiches bio": every word is required in the
 * name, so "2" and "kg" doomed the query. Someone typing "2 kg de tomates"
 * into the search bar hit the same wall.
 *
 * No catalogue product carries a unit in its name; the day one is called
 * "Huile 5 litres", it will have to be found another way.
 */
const QUANTITY_WORDS = new Set([
  'kg',
  'kilo',
  'kilos',
  'kilogramme',
  'kilogrammes',
  'g',
  'gramme',
  'grammes',
  'l',
  'litre',
  'litres',
  'cl',
  'ml',
  'piece',
  'pieces',
  'pièce',
  'pièces',
  'unite',
  'unites',
  'unité',
  'unités',
])

/** A number written in digits names no product. */
function isQuantity(term: string): boolean {
  return /^\d+(?:[.,]\d+)?$/.test(term) || QUANTITY_WORDS.has(term.toLowerCase())
}

/** Au-delà, la requête n'est plus une recherche mais une phrase. */
const MAX_SEARCH_TERMS = 6

/**
 * Les mots d'une recherche, chacun devant se retrouver dans le nom du produit
 * ou celui de la boutique.
 *
 * Les mots d'un seul caractère sont écartés : ils ne discriminent rien et
 * feraient correspondre la moitié du catalogue.
 */
export function searchTerms(q: string): string[] {
  const query = LOCAL_SYNONYMS.reduce((text, [said, meant]) => text.replace(said, meant), q)

  const terms = query
    .split(/\s+/)
    .map(term => singularize(term.trim()))
    .filter(term => term.length > 1)

  // A query made only of linking words keeps them: better to look for "le"
  // and find nothing than to drop every term and return the whole catalogue.
  const meaningful = terms.filter(term => !STOPWORDS.has(term.toLowerCase()) && !isQuantity(term))

  return (meaningful.length > 0 ? meaningful : terms).slice(0, MAX_SEARCH_TERMS)
}

/**
 * A word with its plural mark removed.
 *
 * "deux piments" must find "Piment frais local". Matching the stem widens the
 * search instead of narrowing it, since the SQL compares substrings.
 *
 * Words that end in -s without being plurals are left alone: stripping "frais"
 * down to "frai" would drag in "fraise", and "pois" down to "poi" would drag in
 * "poivre" and "poisson".
 */
function singularize(term: string): string {
  if (term.length <= 3 || INVARIABLE.test(term)) {
    return term
  }

  return /[sx]$/i.test(term) ? term.slice(0, -1) : term
}

@Injectable()
export class SearchService {
  constructor(private readonly em: EntityManager) {}

  async searchProducts(query: SearchProductsQuery): Promise<SearchResponse> {
    const {
      q,
      latitude,
      longitude,
      radius,
      category,
      maxPrice,
      inStockOnly,
      minRating,
      mode,
      validatedOnly,
      promoOnly,
      supplierId,
      newerThanDays,
      productIds,
      sortBy,
      page,
      limit,
    } = query

    const offset = (page - 1) * limit
    const hasLocation = latitude !== undefined && longitude !== undefined
    // Sans rayon explicite on borne quand même : sinon une recherche depuis
    // Nantes remonte les fournisseurs de Cotonou à 4 500 km.
    const radiusMeters = radius !== undefined && radius > 0 ? radius : DEFAULT_RADIUS_METERS
    // A list of identifiers is not a proximity query: someone naming exactly
    // which products they want is not asking what is nearby, and the default
    // bound would drop the far ones without a word. The position is still
    // read, so the cards keep telling how far each shop is.
    const boundByDistance = hasLocation && productIds === undefined
    const baseParams: unknown[] = []

    // A suspended shop disappears from the catalogue, always. Filtering on
    // `VALIDATED` instead would also hide shops merely awaiting review, which
    // is what the optional `validatedOnly` flag below is for.
    let whereClause = `
      WHERE p.status = 'ACTIVE'
        AND s.validation_status <> 'SUSPENDED'
    `

    if (boundByDistance) {
      whereClause += `  AND s.location IS NOT NULL\n`
      whereClause += `  AND ST_DWithin(s.location, ST_MakePoint(?, ?)::geography, ?)\n`
      baseParams.push(longitude, latitude, radiusMeters)
    }

    if (validatedOnly === 'true') {
      whereClause += `  AND s.validation_status = 'VALIDATED'\n`
    }

    if (promoOnly === 'true') {
      // A promotion is a price cut, a 1+1 or a free delivery. Only the first
      // mirrors itself onto the product, so the other two are found where
      // they live — otherwise the section showed none of them.
      whereClause += `  AND (${LIVE_LEGACY_PROMO} OR EXISTS (${LIVE_PROMOTION_ROW}))\n`
    }
    if (q) {
      // Mot à mot, et tous exigés. Une seule sous-chaîne sur la phrase
      // entière rendait « huile arachide » muet alors que « huile » et
      // « arachide » trouvaient chacun quelque chose : personne n'écrit le
      // nom exact d'un produit, et l'apostrophe de « huile d'arachide »
      // suffisait à tout faire échouer.
      for (const term of searchTerms(q)) {
        // unaccent on both sides: the catalogue is typed "Tomates fraiches"
        // while speech dictation gives "tomates fraîches". Without it the
        // assistant announces a shortage that does not exist.
        whereClause += `  AND (unaccent(p.name) ILIKE unaccent(?) OR unaccent(s.shop_name) ILIKE unaccent(?))\n`
        baseParams.push(`%${term}%`, `%${term}%`)
      }
    }

    if (category) {
      whereClause += `  AND c.slug = ?\n`
      baseParams.push(category)
    }

    if (maxPrice !== undefined) {
      whereClause += `  AND p.price_per_unit <= ?\n`
      baseParams.push(maxPrice)
    }

    if (inStockOnly === 'true') {
      whereClause += `  AND p.stock > 0\n`
    }

    if (minRating !== undefined) {
      whereClause += `  AND s.global_rating >= ?\n`
      baseParams.push(minRating)
    }

    if (mode) {
      whereClause += `  AND s.mode = ?\n`
      baseParams.push(mode)
    }

    if (supplierId) {
      whereClause += `  AND s.id = ?\n`
      baseParams.push(supplierId)
    }

    if (newerThanDays !== undefined) {
      whereClause += `  AND p."createdAt" >= NOW() - (? * INTERVAL '1 day')\n`
      baseParams.push(newerThanDays)
    }

    // An empty list does not mean "everything": a hand-picked section whose
    // last product was removed must return nothing.
    if (productIds !== undefined) {
      if (productIds.length === 0) {
        return { results: [], total: 0, page, hasMore: false }
      }
      // One placeholder per id: the driver cannot bind a JavaScript array
      // behind `ANY(?::uuid[])` — it flattens it and the SQL stops parsing.
      whereClause += `  AND p.id IN (${productIds.map(() => '?').join(', ')})\n`
      baseParams.push(...productIds)
    }

    const orderClause = hasLocation ? this.buildOrderClause(sortBy) : this.buildOrderClause(sortBy === 'distance' ? 'rating' : sortBy)

    const countSql = `
      SELECT COUNT(*) as count
      FROM products p
      JOIN suppliers s ON p.supplier_id = s.id
      JOIN categories c ON p.category_id = c.id
      ${whereClause}
    `

    const distanceSelect = hasLocation
      ? `ST_Distance(s.location, ST_MakePoint(?, ?)::geography) as distance`
      : `0 as distance`

    const dataSql = `
      SELECT
        p.id as product_id,
        p.name as product_name,
        p.photos,
        p.price_per_unit,
        p.unit,
        p.stock,
        p.rating_avg,
        p.rating_count,
        CASE WHEN ${LIVE_LEGACY_PROMO} THEN p.promotional_price END AS promotional_price,
        (SELECT COALESCE(array_agg(pp.type), '{}') FROM product_promotions pp
          WHERE pp.product_id = p.id AND pp.is_active = true
            AND pp.starts_at <= NOW() AND (pp.ends_at IS NULL OR pp.ends_at > NOW())) AS promotion_types,
        s.id as supplier_id,
        s.shop_name,
        ST_Y(s.location::geometry) as latitude,
        ST_X(s.location::geometry) as longitude,
        s.mode,
        s.global_rating,
        s.total_reviews,
        s.validation_status,
        s.opening_hours,
        s.timezone,
        ${distanceSelect}
      FROM products p
      JOIN suppliers s ON p.supplier_id = s.id
      JOIN categories c ON p.category_id = c.id
      ${whereClause}
      ${orderClause}
      LIMIT ? OFFSET ?
    `

    const countParams = [...baseParams]
    const selectParams = hasLocation ? [longitude, latitude] : []
    const dataParams = [...selectParams, ...baseParams, limit, offset]

    const connection = this.em.getConnection()
    const [countResult, dataResult] = await Promise.all([
      connection.execute(countSql, countParams) as Promise<RawCountRow[]>,
      connection.execute(dataSql, dataParams) as Promise<RawSearchRow[]>,
    ])

    const total = Number.parseInt(countResult[0].count, 10)
    const results: SearchResult[] = dataResult.map(row => this.mapRowToSearchResult(row))

    return {
      results,
      total,
      page,
      hasMore: offset + limit < total,
    }
  }

  async autocomplete(query: { q: string, latitude: number, longitude: number }): Promise<{
    suggestions: Array<{ text: string, type: 'product' | 'category' | 'supplier', id?: string }>
  }> {
    const { q, latitude, longitude } = query
    const pattern = `%${q}%`

    const sql = `
      (
        SELECT DISTINCT p.name as text, 'product' as type, p.id::text as id
        FROM products p
        JOIN suppliers s ON p.supplier_id = s.id
        WHERE p.status = 'ACTIVE'
          AND s.validation_status <> 'SUSPENDED'
          AND s.location IS NOT NULL
          AND ST_DWithin(s.location, ST_MakePoint(?, ?)::geography, 50000)
          AND unaccent(p.name) ILIKE unaccent(?)
        LIMIT 5
      )
      UNION ALL
      (
        SELECT c.name as text, 'category' as type, c.id::text as id
        FROM categories c
        WHERE unaccent(c.name) ILIKE unaccent(?)
        LIMIT 3
      )
      UNION ALL
      (
        SELECT s.shop_name as text, 'supplier' as type, s.id::text as id
        FROM suppliers s
        WHERE s.location IS NOT NULL
          AND ST_DWithin(s.location, ST_MakePoint(?, ?)::geography, 50000)
          AND unaccent(s.shop_name) ILIKE unaccent(?)
          AND s.validation_status = 'VALIDATED'
        LIMIT 3
      )
    `

    const connection = this.em.getConnection()
    // One binding per ? in order of appearance — knex has no numbered params.
    const rows = await connection.execute(sql, [longitude, latitude, pattern, pattern, longitude, latitude, pattern]) as RawAutocompleteRow[]

    return {
      suggestions: rows.map(row => ({
        text: row.text,
        type: row.type,
        ...(row.id ? { id: row.id } : {}),
      })),
    }
  }

  async getCategories(): Promise<{
    categories: Array<{ id: string, name: string, slug: string, imageUrl: string | null, productCount: number }>
  }> {
    const sql = `
      SELECT
        c.id,
        c.name,
        c.slug,
        c.image_url,
        COUNT(p.id)::int as product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id AND p.status = 'ACTIVE'
      GROUP BY c.id, c.name, c.slug, c.image_url, c.sort_order
      ORDER BY c.sort_order ASC
    `

    const connection = this.em.getConnection()
    const rows = await connection.execute(sql) as RawCategoryRow[]

    return {
      categories: rows.map(row => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        imageUrl: row.image_url,
        productCount: Number.parseInt(row.product_count, 10),
      })),
    }
  }

  private buildOrderClause(sortBy: string): string {
    switch (sortBy) {
      case 'rating':
        // The product's own rating, not its shop's. `NULLS LAST` puts the
        // products whose average is not published yet — fewer than three
        // reviews — after those that have one, with no extra construction.
        return 'ORDER BY p.rating_avg DESC NULLS LAST, distance ASC'
      case 'price':
        return 'ORDER BY p.price_per_unit ASC, distance ASC'
      default:
        return 'ORDER BY distance ASC'
    }
  }

  private mapRowToSearchResult(row: RawSearchRow): SearchResult {
    const photos = Array.isArray(row.photos) ? row.photos : []
    const badges = this.computeBadges(row)

    return {
      supplier: {
        id: row.supplier_id,
        shopName: row.shop_name,
        latitude: row.latitude !== null ? Number(row.latitude) : null,
        longitude: row.longitude !== null ? Number(row.longitude) : null,
        distance: Math.round(row.distance),
        rating: row.global_rating,
        reviewCount: row.total_reviews,
        mode: row.mode,
        badges,
        isOpen: isOpenNow(row.opening_hours, undefined, row.timezone),
      },
      product: {
        id: row.product_id,
        name: row.product_name,
        photo: photos[0] ?? null,
        thumbnail: thumbnailUrlFor(photos[0]),
        pricePerUnit: row.price_per_unit,
        unit: row.unit,
        inStock: row.stock > 0,
        promotionalPrice: row.promotional_price,
        ratingAvg: row.rating_avg,
        ratingCount: row.rating_count ?? 0,
        promotionTypes: row.promotion_types ?? [],
      },
    }
  }

  private computeBadges(row: RawSearchRow): Array<'VALIDATED' | 'TOP_SELLER' | 'CERTIFIED_BIO'> {
    const badges: Array<'VALIDATED' | 'TOP_SELLER' | 'CERTIFIED_BIO'> = []

    if (row.validation_status === 'VALIDATED') {
      badges.push('VALIDATED')
    }

    if (row.global_rating !== null && row.global_rating >= 4.5 && row.total_reviews >= 10) {
      badges.push('TOP_SELLER')
    }

    return badges
  }
}
