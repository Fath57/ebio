import type { OpeningHours } from '../../common/opening-hours'
import type { DeliveryZone as DeliveryZoneInput, RegisterSupplier, UpdateSupplier } from './contracts/supplier.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { isOpenNow } from '../../common/opening-hours'
import { User, UserRole } from '../auth/auth.entity'
import { Media } from '../media/media.entity'
import { DeliveryZone } from './entities/delivery-zone.entity'
import { Supplier, SupplierMode, SupplierType } from './supplier.entity'

/** Rayon appliqué quand la requête est géolocalisée sans rayon explicite. */
const DEFAULT_RADIUS_KM = 50

@Injectable()
export class SuppliersService {
  constructor(private readonly em: EntityManager) {}

  async register(userId: string, data: RegisterSupplier): Promise<Supplier> {
    const existing = await this.em.findOne(Supplier, { user: { id: userId } })
    if (existing) {
      throw new ConflictException('User already registered as supplier')
    }

    const user = await this.em.findOneOrFail(User, { id: userId })

    const supplier = this.em.create(Supplier, {
      user,
      shopName: data.shopName,
      type: data.type as SupplierType,
      address: data.address,
      neighborhood: data.neighborhood,
      mobileMoneyNumber: data.mobileMoneyNumber,
      mode: data.mode as SupplierMode,
      openingHours: data.openingHours,
      deliveryFee: data.deliveryFee ?? 0,
      freeDeliveryFrom: data.freeDeliveryFrom ?? undefined,
    })

    user.role = UserRole.SUPPLIER

    // The app uploads the shop photo and the documents before submitting the
    // form, then sends their media ids here. The photo is public, its URL goes
    // straight on the profile. The documents live in a private S3 prefix: the
    // media id is stored instead, and the validation screen asks for a signed
    // URL at read time.
    if (data.shopPhotoMediaId) {
      const media = await this.em.findOne(Media, { id: data.shopPhotoMediaId })
      if (media?.publicUrl) {
        supplier.profilePhoto = media.publicUrl
      }
    }
    if (data.identityDocMediaId) {
      const media = await this.em.findOne(Media, { id: data.identityDocMediaId })
      if (media) {
        supplier.identityDocument = media.id
      }
    }
    if (data.businessProofMediaId) {
      const media = await this.em.findOne(Media, { id: data.businessProofMediaId })
      if (media) {
        supplier.businessProof = media.id
      }
    }

    await this.em.flush()

    if (data.latitude !== undefined && data.longitude !== undefined) {
      await this.updateLocation(supplier.id, data.latitude, data.longitude)
    }

    return supplier
  }

  async findById(id: string): Promise<Supplier> {
    const supplier = await this.em.findOne(Supplier, { id }, { populate: ['user'] })
    if (!supplier) {
      throw new NotFoundException('Supplier not found')
    }
    return supplier
  }

  async findByUserId(userId: string): Promise<Supplier> {
    const supplier = await this.em.findOne(Supplier, { user: { id: userId } }, { populate: ['user'] })
    if (!supplier) {
      throw new NotFoundException('Supplier profile not found for this user')
    }
    return supplier
  }

  async update(supplierId: string, data: UpdateSupplier): Promise<Supplier> {
    const supplier = await this.findById(supplierId)

    if (data.shopName !== undefined)
      supplier.shopName = data.shopName
    if (data.type !== undefined)
      supplier.type = data.type as SupplierType
    if (data.address !== undefined)
      supplier.address = data.address
    if (data.neighborhood !== undefined)
      supplier.neighborhood = data.neighborhood
    if (data.mobileMoneyNumber !== undefined)
      supplier.mobileMoneyNumber = data.mobileMoneyNumber
    if (data.mode !== undefined)
      supplier.mode = data.mode as SupplierMode
    if (data.deliveryFee !== undefined)
      supplier.deliveryFee = data.deliveryFee
    // Null is meaningful here — it clears the free-delivery threshold.
    if (data.freeDeliveryFrom !== undefined)
      supplier.freeDeliveryFrom = data.freeDeliveryFrom ?? undefined
    if (data.openingHours !== undefined)
      supplier.openingHours = data.openingHours
    if (data.coverPhoto !== undefined)
      supplier.coverPhoto = data.coverPhoto
    if (data.profilePhoto !== undefined)
      supplier.profilePhoto = data.profilePhoto

    if (data.latitude !== undefined && data.longitude !== undefined) {
      await this.updateLocation(supplierId, data.latitude, data.longitude)
    }

    await this.em.flush()
    return supplier
  }

  async findNearby(latitude?: number, longitude?: number, radiusKm?: number) {
    const hasLocation = latitude !== undefined && longitude !== undefined
      && !Number.isNaN(latitude) && !Number.isNaN(longitude)

    // Une requête géolocalisée est toujours bornée : sans rayon explicite, la
    // carte remontait des fournisseurs à 4 500 km.
    const radiusMeters = (radiusKm !== undefined && radiusKm > 0 ? radiusKm : DEFAULT_RADIUS_KM) * 1000

    // Chaque lieu de vente est un pin : la boutique principale et chacun de
    // ses points de vente actifs. Un fournisseur présent au marché ET à sa
    // boutique apparaît donc deux fois, chacun à sa vraie position.
    const query = hasLocation
      ? `WITH lieux AS (
          SELECT s.id AS supplier_id, NULL::uuid AS sales_point_id, NULL::varchar AS point_name,
                 s.location, s.opening_hours AS point_hours
          FROM suppliers s
          WHERE s.location IS NOT NULL
          UNION ALL
          SELECT sp.supplier_id, sp.id, sp.name,
                 sp.location, COALESCE(sp.opening_hours, sup.opening_hours)
          FROM sales_points sp
          JOIN suppliers sup ON sup.id = sp.supplier_id
          WHERE sp.is_active AND sp.location IS NOT NULL
        )
        SELECT
          s.id,
          l.sales_point_id AS "salesPointId",
          l.point_name AS "salesPointName",
          s.shop_name AS "shopName",
          ST_Y(l.location::geometry) AS latitude,
          ST_X(l.location::geometry) AS longitude,
          s.global_rating AS "rating",
          s.mode,
          s.validation_status AS "validationStatus",
          l.point_hours AS "openingHours",
          s.timezone,
          s.cover_photo AS "coverPhoto",
          ROUND(ST_Distance(l.location, ST_MakePoint(?, ?)::geography)::numeric / 1000, 2) AS distance,
          (SELECT p.name FROM products p WHERE p.supplier_id = s.id AND p.status = 'ACTIVE' ORDER BY p.stock DESC LIMIT 1) AS "topProduct"
        FROM lieux l
        JOIN suppliers s ON s.id = l.supplier_id
        WHERE s.validation_status = 'VALIDATED'
          AND ST_DWithin(l.location, ST_MakePoint(?, ?)::geography, ?)
        ORDER BY distance ASC`
      : `SELECT
          s.id,
          NULL::uuid AS "salesPointId",
          NULL::varchar AS "salesPointName",
          s.shop_name AS "shopName",
          ST_Y(s.location::geometry) AS latitude,
          ST_X(s.location::geometry) AS longitude,
          s.global_rating AS "rating",
          s.mode,
          s.validation_status AS "validationStatus",
          s.opening_hours AS "openingHours",
          s.timezone,
          s.cover_photo AS "coverPhoto",
          NULL AS distance,
          (SELECT p.name FROM products p WHERE p.supplier_id = s.id AND p.status = 'ACTIVE' ORDER BY p.stock DESC LIMIT 1) AS "topProduct"
        FROM suppliers s
        WHERE s.validation_status = 'VALIDATED'
        ORDER BY s.global_rating DESC NULLS LAST`

    const params = hasLocation
      ? [longitude, latitude, longitude, latitude, radiusMeters]
      : []

    const rows = await this.em.getConnection().execute(query, params)

    return rows.map((row: Record<string, unknown>) => {
      const isOpen = isOpenNow(row.openingHours as OpeningHours, undefined, row.timezone as string)

      return {
        id: row.id,
        salesPointId: row.salesPointId ?? null,
        salesPointName: row.salesPointName ?? null,
        shopName: row.shopName,
        coverPhoto: row.coverPhoto ?? null,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        rating: row.rating !== null ? Number(row.rating) : null,
        isOpen,
        isValidated: row.validationStatus === 'VALIDATED',
        mode: row.mode,
        topProduct: row.topProduct ?? null,
        distance: Number(row.distance),
      }
    })
  }

  /**
   * Reads a shop's coordinates back.
   *
   * The `location` column is a PostGIS geography, which Postgres hands back as
   * EWKB — an opaque hex string on the entity. `ST_Y`/`ST_X` turn it into usable
   * numbers, the way the search queries already do.
   */
  async findCoordinates(supplierId: string): Promise<{ latitude: number, longitude: number } | null> {
    const rows = await this.em.getConnection().execute(
      `SELECT ST_Y(location::geometry) AS latitude,
              ST_X(location::geometry) AS longitude
       FROM suppliers
       WHERE id = ? AND location IS NOT NULL`,
      [supplierId],
    )

    const row = rows[0] as { latitude: number, longitude: number } | undefined
    if (!row) {
      return null
    }

    return { latitude: Number(row.latitude), longitude: Number(row.longitude) }
  }

  async updateLocation(supplierId: string, latitude: number, longitude: number): Promise<void> {
    await this.em.getConnection().execute(
      `UPDATE suppliers SET location = ST_MakePoint(?, ?)::geography WHERE id = ?`,
      [longitude, latitude, supplierId],
    )
  }

  async createDeliveryZone(supplierId: string, data: DeliveryZoneInput): Promise<DeliveryZone> {
    const supplier = await this.findById(supplierId)

    const polygonWkt = `POLYGON((${data.polygon.map(p => `${p.longitude} ${p.latitude}`).join(', ')}, ${data.polygon[0].longitude} ${data.polygon[0].latitude}))`

    const zone = this.em.create(DeliveryZone, {
      supplier,
      polygon: polygonWkt,
      deliveryFee: data.deliveryFee,
      estimatedMinutes: data.estimatedMinutes,
    })

    await this.em.flush()

    await this.em.getConnection().execute(
      `UPDATE delivery_zones SET polygon = ST_GeomFromText(?, 4326)::geography WHERE id = ?`,
      [polygonWkt, zone.id],
    )

    return zone
  }

  async getDashboard(supplierId: string): Promise<{
    pendingOrders: number
    unreadMessages: number
    criticalStockProducts: number
    revenue: number
    commission: number
    netRevenue: number
    pendingEscrow: number
    averageRating: number | null
  }> {
    const supplier = await this.findById(supplierId)
    const db = this.em.getConnection()
    const monthStart = new Date(Date.now() - 30 * 86_400_000)

    const [criticalStockResult, [pending], [sales], [escrow], [unread]] = await Promise.all([
      db.execute(
        `SELECT COUNT(*) as count FROM products WHERE supplier_id = ? AND stock <= stock_alert_threshold AND status = 'ACTIVE'`,
        [supplierId],
      ),
      db.execute(
        `SELECT COUNT(*) AS count FROM orders
         WHERE supplier_id = ? AND status IN ('PLACED', 'ACCEPTED', 'PREPARING', 'READY')`,
        [supplierId],
      ),
      // Rolling 30 days of delivered sales, items only, with the commission
      // alongside so the app can show the net.
      db.execute(
        `SELECT COALESCE(SUM(total_amount - delivery_fee), 0) AS revenue,
                COALESCE(SUM(commission_amount), 0) AS commission
         FROM orders
         WHERE supplier_id = ? AND status = 'DELIVERED' AND "createdAt" >= ?`,
        [supplierId, monthStart],
      ),
      // Delivered money not yet released: what the shop still waits for.
      db.execute(
        `SELECT COALESCE(SUM(total_amount - commission_amount), 0) AS amount
         FROM orders
         WHERE supplier_id = ? AND status = 'DELIVERED' AND escrow_released_at IS NULL`,
        [supplierId],
      ),
      db.execute(
        `SELECT COUNT(*) AS count
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE c.supplier_id = ? AND m.read_at IS NULL AND m.sender_id <> ?`,
        [supplierId, supplier.user.id],
      ),
    ])

    const revenue = Number(sales.revenue)
    const commission = Number(sales.commission)

    return {
      pendingOrders: Number(pending.count),
      unreadMessages: Number(unread.count),
      criticalStockProducts: Number(criticalStockResult[0]?.count ?? 0),
      revenue,
      commission,
      netRevenue: Math.round((revenue - commission) * 100) / 100,
      pendingEscrow: Number(escrow.amount),
      averageRating: supplier.globalRating ?? null,
    }
  }

  async deleteDeliveryZone(supplierId: string, zoneId: string): Promise<void> {
    const zone = await this.em.findOne(DeliveryZone, { id: zoneId, supplier: { id: supplierId } })
    if (!zone)
      throw new NotFoundException('Zone de livraison introuvable')
    this.em.remove(zone)
    await this.em.flush()
  }

  async getSettings(supplierId: string) {
    const supplier = await this.findById(supplierId)
    const zones = await this.em.find(DeliveryZone, { supplier: { id: supplierId } })
    // Without this, the editors can only overwrite the position with wherever
    // the shopkeeper happens to stand — never review or correct what is stored.
    const coordinates = await this.findCoordinates(supplierId)
    return {
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null,
      shopName: supplier.shopName,
      address: supplier.address,
      neighborhood: supplier.neighborhood,
      mobileMoneyNumber: supplier.mobileMoneyNumber,
      coverPhoto: supplier.coverPhoto ?? null,
      profilePhoto: supplier.profilePhoto ?? null,
      openingHours: supplier.openingHours,
      timezone: supplier.timezone,
      mode: supplier.mode,
      deliveryFee: supplier.deliveryFee ?? 0,
      freeDeliveryFrom: supplier.freeDeliveryFrom ?? null,
      deliveryZones: zones.map(z => ({
        id: z.id,
        deliveryFee: z.deliveryFee,
        estimatedMinutes: z.estimatedMinutes,
      })),
    }
  }

  async updateOpeningHours(supplierId: string, openingHours: Record<string, unknown>) {
    const supplier = await this.findById(supplierId)
    supplier.openingHours = openingHours
    await this.em.flush()
    return { openingHours: supplier.openingHours }
  }

  async updateMode(supplierId: string, mode: string) {
    const supplier = await this.findById(supplierId)
    supplier.mode = mode as SupplierMode
    await this.em.flush()
    return { mode: supplier.mode }
  }

  /** Days covered by each analytics period keyword. */
  private static readonly PERIOD_DAYS: Record<string, number> = {
    week: 7,
    month: 30,
    quarter: 90,
  }

  async getAnalytics(supplierId: string, period: string) {
    const days = SuppliersService.PERIOD_DAYS[period] ?? 30
    const now = Date.now()
    const start = new Date(now - days * 86_400_000)
    const previousStart = new Date(now - 2 * days * 86_400_000)
    const db = this.em.getConnection()

    // Delivered orders only: money the shop actually made. The commission is
    // shown so the shop knows its net, not just its gross.
    const query = `
      SELECT COUNT(*) AS orders,
             COALESCE(SUM(total_amount - delivery_fee), 0) AS revenue,
             COALESCE(SUM(commission_amount), 0) AS commission
      FROM orders
      WHERE supplier_id = ? AND status = 'DELIVERED' AND "createdAt" >= ? AND "createdAt" < ?`
    const [[current], [previous]] = await Promise.all([
      db.execute(query, [supplierId, start, new Date(now)]),
      db.execute(query, [supplierId, previousStart, start]),
    ])

    const revenue = Number(current.revenue)
    const ordersCount = Number(current.orders)
    const commission = Number(current.commission)
    const previousRevenue = Number(previous.revenue)
    const previousOrders = Number(previous.orders)

    const trend = (value: number, before: number): number | null =>
      before > 0 ? Math.round(((value - before) / before) * 100) : null

    return {
      revenue,
      ordersCount,
      averageOrder: ordersCount > 0 ? Math.round((revenue / ordersCount) * 100) / 100 : 0,
      commission,
      netRevenue: Math.round((revenue - commission) * 100) / 100,
      revenueTrend: trend(revenue, previousRevenue),
      ordersTrend: trend(ordersCount, previousOrders),
    }
  }

  async getTopProducts(supplierId: string, period: string) {
    const days = SuppliersService.PERIOD_DAYS[period] ?? 30
    const start = new Date(Date.now() - days * 86_400_000)
    const rows = await this.em.getConnection().execute(
      `SELECT p.id, p.name,
              COALESCE(SUM(oi.quantity), 0) AS "quantitySold",
              COALESCE(SUM(oi.total_price), 0) AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       WHERE o.supplier_id = ? AND o.status = 'DELIVERED' AND o."createdAt" >= ?
       GROUP BY p.id, p.name
       ORDER BY revenue DESC
       LIMIT 10`,
      [supplierId, start],
    )
    return {
      data: rows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        name: r.name as string,
        quantitySold: Number(r.quantitySold),
        revenue: Number(r.revenue),
      })),
    }
  }

  async getRatingsOverview(supplierId: string) {
    const supplier = await this.findById(supplierId)
    // Star distribution from each review's four-criteria average.
    const rows = await this.em.getConnection().execute(
      `SELECT ROUND((quality_rating + delay_rating + communication_rating + conformity_rating) / 4.0) AS star,
              COUNT(*) AS count
       FROM reviews WHERE supplier_id = ?
       GROUP BY star`,
      [supplierId],
    )
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const row of rows as Array<{ star: number, count: number }>) {
      distribution[Number(row.star)] = Number(row.count)
    }
    return {
      average: supplier.globalRating ?? 0,
      totalCount: supplier.totalReviews,
      distribution,
    }
  }
}
