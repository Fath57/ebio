import type { OpeningHours } from '../../common/opening-hours'
import type { DeliveryZone as DeliveryZoneInput, RegisterSupplier, UpdateSupplier } from './contracts/supplier.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { isOpenNow } from '../../common/opening-hours'
import { User, UserRole } from '../auth/auth.entity'
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
    })

    user.role = UserRole.SUPPLIER
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

    const distanceSelect = hasLocation
      ? `ROUND(ST_Distance(s.location, ST_MakePoint(?, ?)::geography)::numeric / 1000, 2)`
      : `NULL`

    const whereClause = hasLocation
      ? `WHERE s.location IS NOT NULL
        AND s.validation_status = 'VALIDATED'
        AND ST_DWithin(s.location, ST_MakePoint(?, ?)::geography, ?)`
      : `WHERE s.validation_status = 'VALIDATED'`

    const orderClause = hasLocation
      ? 'ORDER BY distance ASC'
      : 'ORDER BY s.global_rating DESC NULLS LAST'

    const query = `SELECT
        s.id,
        s.shop_name AS "shopName",
        ST_Y(s.location::geometry) AS latitude,
        ST_X(s.location::geometry) AS longitude,
        s.global_rating AS "rating",
        s.mode,
        s.validation_status AS "validationStatus",
        s.opening_hours AS "openingHours",
        s.timezone,
        s.cover_photo AS "coverPhoto",
        ${distanceSelect} AS distance,
        (SELECT p.name FROM products p WHERE p.supplier_id = s.id AND p.status = 'ACTIVE' ORDER BY p.stock DESC LIMIT 1) AS "topProduct"
      FROM suppliers s
      ${whereClause}
      ${orderClause}`

    const params = hasLocation
      ? [longitude, latitude, longitude, latitude, radiusMeters]
      : []

    const rows = await this.em.getConnection().execute(query, params)

    return rows.map((row: Record<string, unknown>) => {
      const isOpen = isOpenNow(row.openingHours as OpeningHours, undefined, row.timezone as string)

      return {
        id: row.id,
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
    pendingEscrow: number
    averageRating: number | null
  }> {
    const supplier = await this.findById(supplierId)

    const criticalStockResult = await this.em.getConnection().execute(
      `SELECT COUNT(*) as count FROM products WHERE supplier_id = ? AND stock <= stock_alert_threshold AND status = 'ACTIVE'`,
      [supplierId],
    )

    return {
      pendingOrders: 0,
      unreadMessages: 0,
      criticalStockProducts: Number(criticalStockResult[0]?.count ?? 0),
      revenue: 0,
      pendingEscrow: 0,
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
    return {
      shopName: supplier.shopName,
      address: supplier.address,
      neighborhood: supplier.neighborhood,
      mobileMoneyNumber: supplier.mobileMoneyNumber,
      coverPhoto: supplier.coverPhoto ?? null,
      profilePhoto: supplier.profilePhoto ?? null,
      openingHours: supplier.openingHours,
      timezone: supplier.timezone,
      mode: supplier.mode,
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

  async getAnalytics(_supplierId: string, _period: string) {
    // TODO: implement period-based aggregation
    return {
      revenue: 0,
      orders: 0,
      averageOrderValue: 0,
    }
  }

  async getTopProducts(supplierId: string, _period: string) {
    const rows = await this.em.getConnection().execute(
      `SELECT p.id, p.name, p.stock, p.price_per_unit as "pricePerUnit"
       FROM products p WHERE p.supplier_id = ? AND p.status = 'ACTIVE'
       ORDER BY p.stock DESC LIMIT 10`,
      [supplierId],
    )
    return { products: rows }
  }

  async getRatingsOverview(supplierId: string) {
    const supplier = await this.findById(supplierId)
    return {
      averageRating: supplier.globalRating,
      totalReviews: supplier.totalReviews,
    }
  }
}
