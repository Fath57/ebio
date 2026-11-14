import type { Rel } from '@mikro-orm/core'
import { Collection, Entity, Enum, Index, ManyToOne, OneToMany, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { ExportDepartureStatus } from '../contracts/terroir.contract'
import { ExportAgency } from './export-agency.entity'
import { ExportDepartureRate } from './export-departure-rate.entity'

/**
 * One departure of a partner agency (011): its dates, the announced transit,
 * an optional negotiated capacity and the price per country (rates).
 *
 * Offered to buyers only while OPEN, before `deposit_deadline` minus eBio's
 * collection days, and while it has room (FR-010, FR-010a).
 */
@Entity({ tableName: 'export_departures' })
@Index({ name: 'export_departures_status_idx', properties: ['status', 'departsOn'] })
export class ExportDeparture {
  [OptionalProps]?: 'id' | 'status' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => ExportAgency, { fieldName: 'agency_id' })
  agency!: Rel<ExportAgency>

  /** Calendar day, `YYYY-MM-DD`. */
  @Property({ fieldName: 'departs_on', type: 'date' })
  departsOn!: string

  @Property({ fieldName: 'deposit_deadline', type: 'Date' })
  depositDeadline!: Date

  @Property({ fieldName: 'transit_min_days', type: 'smallint' })
  transitMinDays!: number

  @Property({ fieldName: 'transit_max_days', type: 'smallint' })
  transitMaxDays!: number

  /** numeric(8,2) as a string; null means no limit. */
  @Property({ fieldName: 'capacity_kg', columnType: 'numeric(8,2)', nullable: true })
  capacityKg?: string | null

  @Enum({ items: () => ExportDepartureStatus, columnType: 'varchar(10)', default: ExportDepartureStatus.OPEN })
  status: ExportDepartureStatus = ExportDepartureStatus.OPEN

  /** When the team was told it reached 80 %: once per departure. */
  @Property({ fieldName: 'fill_alerted_at', type: 'Date', nullable: true })
  fillAlertedAt?: Date | null

  @OneToMany(() => ExportDepartureRate, rate => rate.departure, { orphanRemoval: true })
  rates = new Collection<ExportDepartureRate>(this)

  @Property({ fieldName: 'created_at', type: 'Date' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updated_at', type: 'Date', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
