import type { OpeningHours } from '../../common/opening-hours'
import type { SearchProductsQuery, SearchResponse, SearchResult } from './contracts/search.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'
import { isOpenNow } from '../../common/opening-hours'

interface RawSearchRow {
  product_id: string
  product_name: string
  photos: string[]
  price_per_unit: number
  unit: string
  stock: number
  promotional_price: number | null
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
      sortBy,
      page,
      limit,
    } = query

    const offset = (page - 1) * limit
    const hasLocation = latitude !== undefined && longitude !== undefined
    // Sans rayon explicite on borne quand même : sinon une recherche depuis
    // Nantes remonte les fournisseurs de Cotonou à 4 500 km.
    const radiusMeters = radius !== undefined && radius > 0 ? radius : DEFAULT_RADIUS_METERS
    const baseParams: unknown[] = []

    let whereClause = `
      WHERE p.status = 'ACTIVE'
    `

    if (hasLocation) {
      whereClause += `  AND s.location IS NOT NULL\n`
      whereClause += `  AND ST_DWithin(s.location, ST_MakePoint(?, ?)::geography, ?)\n`
      baseParams.push(longitude, latitude, radiusMeters)
    }

    if (validatedOnly === 'true') {
      whereClause += `  AND s.validation_status = 'VALIDATED'\n`
    }

    if (promoOnly === 'true') {
      whereClause += `  AND p.promotional_price IS NOT NULL\n`
    }

    if (q) {
      whereClause += `  AND (p.name ILIKE ? OR s.shop_name ILIKE ?)\n`
      baseParams.push(`%${q}%`, `%${q}%`)
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
        p.promotional_price,
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
          AND s.location IS NOT NULL
          AND ST_DWithin(s.location, ST_MakePoint($1, $2)::geography, 50000)
          AND p.name ILIKE $3
        LIMIT 5
      )
      UNION ALL
      (
        SELECT c.name as text, 'category' as type, c.id::text as id
        FROM categories c
        WHERE c.name ILIKE $3
        LIMIT 3
      )
      UNION ALL
      (
        SELECT s.shop_name as text, 'supplier' as type, s.id::text as id
        FROM suppliers s
        WHERE s.location IS NOT NULL
          AND ST_DWithin(s.location, ST_MakePoint($1, $2)::geography, 50000)
          AND s.shop_name ILIKE $3
          AND s.validation_status = 'VALIDATED'
        LIMIT 3
      )
    `

    const connection = this.em.getConnection()
    const rows = await connection.execute(sql, [longitude, latitude, pattern]) as RawAutocompleteRow[]

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
        return 'ORDER BY s.global_rating DESC NULLS LAST, distance ASC'
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
        pricePerUnit: row.price_per_unit,
        unit: row.unit,
        inStock: row.stock > 0,
        promotionalPrice: row.promotional_price,
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
