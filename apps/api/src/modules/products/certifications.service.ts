import type { CertificationResponse, CreateCertification, UpdateCertification } from './contracts/certification.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Certification } from './entities/certification.entity'

@Injectable()
export class CertificationsService {
  constructor(private readonly em: EntityManager) {}

  async findAll(activeOnly: boolean): Promise<{ items: CertificationResponse[], total: number }> {
    const certifications = await this.em.find(
      Certification,
      activeOnly ? { isActive: true } : {},
      { orderBy: { sortOrder: 'ASC', name: 'ASC' } },
    )
    const counts = await this.countByCode()
    const items = certifications.map(item => this.toResponse(item, counts.get(item.code) ?? 0))
    return { items, total: items.length }
  }

  async findById(id: string): Promise<CertificationResponse> {
    const certification = await this.load(id)
    const counts = await this.countByCode()
    return this.toResponse(certification, counts.get(certification.code) ?? 0)
  }

  async create(data: CreateCertification): Promise<CertificationResponse> {
    if (await this.em.findOne(Certification, { code: data.code })) {
      throw new ConflictException(`Le label « ${data.code} » existe déjà`)
    }
    const certification = this.em.create(Certification, {
      code: data.code,
      name: data.name,
      description: data.description ?? null,
      logoUrl: data.logoUrl ?? null,
      isActive: data.isActive,
      sortOrder: data.sortOrder,
    })
    await this.em.flush()
    return this.toResponse(certification, 0)
  }

  async update(id: string, data: UpdateCertification): Promise<CertificationResponse> {
    const certification = await this.load(id)
    if (data.name !== undefined)
      certification.name = data.name
    if (data.description !== undefined)
      certification.description = data.description
    if (data.logoUrl !== undefined)
      certification.logoUrl = data.logoUrl
    if (data.isActive !== undefined)
      certification.isActive = data.isActive
    if (data.sortOrder !== undefined)
      certification.sortOrder = data.sortOrder
    await this.em.flush()
    const counts = await this.countByCode()
    return this.toResponse(certification, counts.get(certification.code) ?? 0)
  }

  async remove(id: string): Promise<void> {
    const certification = await this.load(id)
    // Deleting a label still worn would leave products naming a code nothing
    // describes. Deactivating empties the pickers without touching them.
    const used = (await this.countByCode()).get(certification.code) ?? 0
    if (used > 0) {
      throw new ConflictException(
        `${used} produit(s) portent ce label. Désactivez-le plutôt que de le supprimer.`,
      )
    }
    await this.em.removeAndFlush(certification)
  }

  /**
   * Guards the labels submitted with a product. A code a product already
   * carries stays accepted even once retired, so editing an old product does
   * not fail on a label nobody can pick any more.
   */
  async assertUsable(codes: string[], alreadyCarried: string[] = []): Promise<void> {
    const wanted = [...new Set(codes)].filter(code => !alreadyCarried.includes(code))
    if (wanted.length === 0)
      return
    const found = await this.em.find(Certification, { code: { $in: wanted }, isActive: true })
    const known = new Set(found.map(item => item.code))
    const unknown = wanted.filter(code => !known.has(code))
    if (unknown.length > 0) {
      throw new BadRequestException(`Label inconnu ou désactivé : ${unknown.join(', ')}`)
    }
  }

  private async load(id: string): Promise<Certification> {
    const certification = await this.em.findOne(Certification, { id })
    if (!certification) {
      throw new NotFoundException('Label introuvable')
    }
    return certification
  }

  /** One grouped scan over the label arrays, whatever the number of entries. */
  private async countByCode(): Promise<Map<string, number>> {
    const rows = await this.em.getConnection().execute(
      `SELECT label, COUNT(*)::int AS count FROM products, jsonb_array_elements_text(labels) AS label GROUP BY label`,
    ) as Array<{ label: string, count: number }>
    return new Map(rows.map(row => [row.label, row.count]))
  }

  private toResponse(certification: Certification, productCount: number): CertificationResponse {
    return {
      id: certification.id,
      code: certification.code,
      name: certification.name,
      description: certification.description ?? null,
      logoUrl: certification.logoUrl ?? null,
      isActive: certification.isActive,
      sortOrder: certification.sortOrder,
      productCount,
    }
  }
}
