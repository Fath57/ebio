import type { OpeningHours } from '../../common/opening-hours'
import type { CreateSalesPoint, SalesPointResponse, UpdateSalesPoint } from './contracts/sales-point.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, NotFoundException } from '@nestjs/common'
import { isOpenNow } from '../../common/opening-hours'
import { SalesPoint } from './entities/sales-point.entity'
import { Supplier } from './supplier.entity'

@Injectable()
export class SalesPointsService {
  constructor(private readonly em: EntityManager) {}

  /** What buyers see on a shop page: active points only. */
  async findPublic(supplierId: string): Promise<SalesPointResponse[]> {
    return this.toResponses(
      await this.em.find(SalesPoint, { supplier: { id: supplierId }, isActive: true }, {
        populate: ['supplier'],
        orderBy: { createdAt: 'ASC' },
      }),
    )
  }

  /** The owner manages every point, paused ones included. */
  async findMine(supplierId: string): Promise<SalesPointResponse[]> {
    return this.toResponses(
      await this.em.find(SalesPoint, { supplier: { id: supplierId } }, {
        populate: ['supplier'],
        orderBy: { createdAt: 'ASC' },
      }),
    )
  }

  async create(supplierId: string, data: CreateSalesPoint): Promise<SalesPointResponse> {
    const supplier = await this.em.findOneOrFail(Supplier, { id: supplierId })
    const point = this.em.create(SalesPoint, {
      supplier,
      name: data.name,
      address: data.address,
      phone: data.phone,
      openingHours: data.openingHours as Record<string, unknown> | undefined,
      isActive: data.isActive,
    })
    await this.em.flush()

    if (data.latitude !== undefined && data.longitude !== undefined) {
      await this.writeLocation(point.id, data.latitude, data.longitude)
    }

    return (await this.toResponses([point]))[0]
  }

  async update(supplierId: string, pointId: string, data: UpdateSalesPoint): Promise<SalesPointResponse> {
    const point = await this.findOwned(supplierId, pointId)

    if (data.name !== undefined)
      point.name = data.name
    if (data.address !== undefined)
      point.address = data.address
    if (data.phone !== undefined)
      point.phone = data.phone
    if (data.openingHours !== undefined)
      point.openingHours = data.openingHours as Record<string, unknown> | undefined
    if (data.isActive !== undefined)
      point.isActive = data.isActive
    await this.em.flush()

    if (data.latitude === null || data.longitude === null) {
      await this.em.getConnection().execute(
        `UPDATE sales_points SET location = NULL WHERE id = ?`,
        [point.id],
      )
    }
    else if (data.latitude !== undefined && data.longitude !== undefined) {
      await this.writeLocation(point.id, data.latitude, data.longitude)
    }

    return (await this.toResponses([point]))[0]
  }

  async remove(supplierId: string, pointId: string): Promise<void> {
    const point = await this.findOwned(supplierId, pointId)
    await this.em.removeAndFlush(point)
  }

  private async findOwned(supplierId: string, pointId: string): Promise<SalesPoint> {
    const point = await this.em.findOne(SalesPoint, { id: pointId, supplier: { id: supplierId } }, {
      populate: ['supplier'],
    })
    if (!point) {
      throw new NotFoundException('Point de vente introuvable')
    }
    return point
  }

  /** The geography column is opaque on the entity: coordinates go through SQL. */
  private async writeLocation(pointId: string, latitude: number, longitude: number): Promise<void> {
    await this.em.getConnection().execute(
      `UPDATE sales_points SET location = ST_MakePoint(?, ?)::geography WHERE id = ?`,
      [longitude, latitude, pointId],
    )
  }

  private async toResponses(points: SalesPoint[]): Promise<SalesPointResponse[]> {
    if (points.length === 0) {
      return []
    }

    const rows = await this.em.getConnection().execute(
      `SELECT id, ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude
       FROM sales_points WHERE id IN (?) AND location IS NOT NULL`,
      [points.map(point => point.id)],
    ) as Array<{ id: string, latitude: number, longitude: number }>
    const coordinates = new Map(rows.map(row => [row.id, row]))

    return points.map((point) => {
      const coords = coordinates.get(point.id)
      // A stall without its own hours follows the shop's.
      const hours = (point.openingHours ?? point.supplier.openingHours) as OpeningHours | undefined
      return {
        id: point.id,
        name: point.name,
        address: point.address ?? null,
        phone: point.phone ?? null,
        latitude: coords ? Number(coords.latitude) : null,
        longitude: coords ? Number(coords.longitude) : null,
        openingHours: (point.openingHours as Record<string, unknown> | undefined) ?? null,
        isActive: point.isActive,
        isOpen: hours ? isOpenNow(hours, undefined, point.supplier.timezone ?? undefined) : null,
      }
    })
  }
}
