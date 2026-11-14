import { Collection, Entity, OneToMany, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { ExportPickupPoint } from './export-pickup-point.entity'

/**
 * A partner agency shipping eBio's parcels (011). Only agencies that quote
 * « duties and taxes included » are entered (FR-014); eBio pays them outside
 * the app.
 */
@Entity({ tableName: 'export_agencies' })
export class ExportAgency {
  [OptionalProps]?: 'id' | 'active' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ type: 'string', length: 120 })
  name!: string

  @Property({ fieldName: 'contact_name', type: 'string', length: 120, nullable: true })
  contactName?: string | null

  @Property({ fieldName: 'contact_phone', type: 'string', length: 30, nullable: true })
  contactPhone?: string | null

  @Property({ fieldName: 'contact_email', type: 'string', length: 200, nullable: true })
  contactEmail?: string | null

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ type: 'boolean', default: true })
  active: boolean = true

  @OneToMany(() => ExportPickupPoint, point => point.agency)
  pickupPoints = new Collection<ExportPickupPoint>(this)

  @Property({ fieldName: 'created_at', type: 'Date' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updated_at', type: 'Date', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
