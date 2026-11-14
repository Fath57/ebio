import type { Rel } from '@mikro-orm/core'
import { Entity, ManyToOne, OptionalProps, PrimaryKey, PrimaryKeyProp, Property } from '@mikro-orm/core'
import { ExportDeparture } from './export-departure.entity'

/**
 * A departure's price towards one country. Amounts are numeric strings from
 * the driver; Number() at the edges.
 */
@Entity({ tableName: 'export_departure_rates' })
export class ExportDepartureRate {
  [PrimaryKeyProp]?: ['departure', 'country']
  [OptionalProps]?: 'minBilledKg'

  @ManyToOne(() => ExportDeparture, { primary: true, fieldName: 'departure_id', deleteRule: 'cascade' })
  departure!: Rel<ExportDeparture>

  /** References `export_countries.code`. */
  @PrimaryKey({ type: 'string', length: 2, columnType: 'varchar(2)' })
  country!: string

  /** FCFA per kilo, duties and taxes included. */
  @Property({ fieldName: 'price_per_kg', columnType: 'numeric(12,2)' })
  pricePerKg!: string

  @Property({ fieldName: 'min_billed_kg', columnType: 'numeric(6,2)', default: '0' })
  minBilledKg: string = '0'

  @Property({ fieldName: 'max_weight_kg', columnType: 'numeric(6,2)', nullable: true })
  maxWeightKg?: string | null

  /** Null: no door delivery in this country. */
  @Property({ fieldName: 'home_delivery_fee', columnType: 'numeric(12,2)', nullable: true })
  homeDeliveryFee?: string | null
}
