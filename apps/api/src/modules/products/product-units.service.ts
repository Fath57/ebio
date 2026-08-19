import type { CreateProductUnit, ProductUnitResponse, UpdateProductUnit } from './contracts/product-unit.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ProductUnit } from './entities/product-unit.entity'

@Injectable()
export class ProductUnitsService {
  constructor(private readonly em: EntityManager) {}

  async findAll(activeOnly: boolean): Promise<{ items: ProductUnitResponse[], total: number }> {
    const units = await this.em.find(
      ProductUnit,
      activeOnly ? { isActive: true } : {},
      { orderBy: { sortOrder: 'ASC', label: 'ASC' } },
    )
    const counts = await this.countByCode()
    const items = units.map(unit => this.toResponse(unit, counts.get(unit.code) ?? 0))
    return { items, total: items.length }
  }

  async findById(id: string): Promise<ProductUnitResponse> {
    const unit = await this.em.findOne(ProductUnit, { id })
    if (!unit) {
      throw new NotFoundException('Unité introuvable')
    }
    const counts = await this.countByCode()
    return this.toResponse(unit, counts.get(unit.code) ?? 0)
  }

  async create(data: CreateProductUnit): Promise<ProductUnitResponse> {
    const existing = await this.em.findOne(ProductUnit, { code: data.code })
    if (existing) {
      throw new ConflictException(`L'unité « ${data.code} » existe déjà`)
    }

    const unit = this.em.create(ProductUnit, {
      code: data.code,
      label: data.label,
      shortLabel: data.shortLabel,
      isActive: data.isActive,
      sortOrder: data.sortOrder,
    })
    await this.em.flush()
    return this.toResponse(unit, 0)
  }

  async update(id: string, data: UpdateProductUnit): Promise<ProductUnitResponse> {
    const unit = await this.em.findOne(ProductUnit, { id })
    if (!unit) {
      throw new NotFoundException('Unité introuvable')
    }

    if (data.label !== undefined)
      unit.label = data.label
    if (data.shortLabel !== undefined)
      unit.shortLabel = data.shortLabel
    if (data.isActive !== undefined)
      unit.isActive = data.isActive
    if (data.sortOrder !== undefined)
      unit.sortOrder = data.sortOrder

    await this.em.flush()
    const counts = await this.countByCode()
    return this.toResponse(unit, counts.get(unit.code) ?? 0)
  }

  async remove(id: string): Promise<void> {
    const unit = await this.em.findOne(ProductUnit, { id })
    if (!unit) {
      throw new NotFoundException('Unité introuvable')
    }

    // Deleting a unit still worn by products would leave their price labelled
    // by a code nothing describes any more. Deactivating is the way out: it
    // empties the pickers without touching what is already sold.
    const counts = await this.countByCode()
    const used = counts.get(unit.code) ?? 0
    if (used > 0) {
      throw new ConflictException(
        `${used} produit(s) utilisent cette unité. Désactivez-la plutôt que de la supprimer.`,
      )
    }

    await this.em.removeAndFlush(unit)
  }

  /**
   * Guards the code a supplier submits with their product. Validation lives
   * here rather than in a database constraint, which would have to be rewritten
   * every time an admin adds a unit.
   */
  async assertUsable(code: string): Promise<void> {
    const unit = await this.em.findOne(ProductUnit, { code })
    if (!unit || !unit.isActive) {
      throw new BadRequestException(`Unité inconnue ou désactivée : ${code}`)
    }
  }

  /** One grouped scan, whatever the number of units listed. */
  private async countByCode(): Promise<Map<string, number>> {
    const rows = await this.em.getConnection().execute(
      `SELECT unit, COUNT(*)::int AS count FROM products GROUP BY unit`,
    ) as Array<{ unit: string, count: number }>
    return new Map(rows.map(row => [row.unit, row.count]))
  }

  private toResponse(unit: ProductUnit, productCount: number): ProductUnitResponse {
    return {
      id: unit.id,
      code: unit.code,
      label: unit.label,
      shortLabel: unit.shortLabel,
      isActive: unit.isActive,
      sortOrder: unit.sortOrder,
      productCount,
    }
  }
}
