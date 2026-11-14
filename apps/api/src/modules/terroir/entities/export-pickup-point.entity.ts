import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, Index, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { ExportCountry } from '../contracts/terroir.contract'
import { ExportAgency } from './export-agency.entity'

/** Where a buyer collects their parcel abroad: city, address, opening hours. */
@Entity({ tableName: 'export_pickup_points' })
export class ExportPickupPoint {
  [OptionalProps]?: 'id' | 'active' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Index({ name: 'export_pickup_points_agency_idx' })
  @ManyToOne(() => ExportAgency, { fieldName: 'agency_id' })
  agency!: Rel<ExportAgency>

  @Enum({ items: () => ExportCountry, columnType: 'varchar(2)' })
  country!: ExportCountry

  @Property({ type: 'string', length: 80 })
  city!: string

  @Property({ type: 'text' })
  address!: string

  /** Free text, shown as typed (« mar.–sam. 10 h–19 h »). */
  @Property({ fieldName: 'opening_hours', type: 'text', nullable: true })
  openingHours?: string | null

  @Property({ type: 'boolean', default: true })
  active: boolean = true

  @Property({ fieldName: 'created_at', type: 'Date' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updated_at', type: 'Date', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
