import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, Index, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { ExportShipmentStatus } from '../contracts/terroir.contract'
import { ExportShipment } from './export-shipment.entity'

/**
 * One line of a parcel's timeline: a standard step, a free message, or both.
 * `pickupPointSnapshot` freezes the address and hours shown at « disponible
 * au retrait », whatever the agency edits later.
 */
@Entity({ tableName: 'export_shipment_events' })
@Index({ name: 'export_shipment_events_shipment_idx', properties: ['shipment', 'createdAt'] })
export class ExportShipmentEvent {
  [OptionalProps]?: 'id' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => ExportShipment, { fieldName: 'shipment_id', deleteRule: 'cascade' })
  shipment!: Rel<ExportShipment>

  @Enum({ items: () => ExportShipmentStatus, columnType: 'varchar(20)', nullable: true })
  step?: ExportShipmentStatus | null

  @Property({ type: 'text', nullable: true })
  message?: string | null

  @Property({ fieldName: 'pickup_point_snapshot', type: 'text', nullable: true })
  pickupPointSnapshot?: string | null

  /** Null for what the system wrote itself (a reassignment, a payment). */
  @ManyToOne(() => User, { fieldName: 'author_id', nullable: true })
  author?: Rel<User> | null

  @Property({ fieldName: 'created_at', type: 'Date' })
  createdAt: Date = new Date()
}
