import type { ForeignCurrency } from '../../currency/contracts/currency.contract'
import { Entity, OptionalProps, PrimaryKey, PrimaryKeyProp, Property } from '@mikro-orm/core'

/**
 * A country a terroir parcel can be sent to, edited in the back office. The
 * `country` columns of pickup points, rates, alerts, drafts and parcels
 * reference `code` (foreign keys in the migration). Never deleted: a
 * deactivated country takes no new parcel, its parcels travel to the end.
 */
@Entity({ tableName: 'export_countries' })
export class ExportCountry {
  [PrimaryKeyProp]?: 'code'
  [OptionalProps]?: 'flagEmoji' | 'sortOrder' | 'isActive' | 'createdAt' | 'updatedAt'

  /** ISO 3166-1 alpha-2, uppercase. */
  @PrimaryKey({ type: 'string', length: 2, columnType: 'varchar(2)' })
  code!: string

  /** « France ». */
  @Property({ type: 'string', length: 80 })
  name!: string

  /** « vers la France ». */
  @Property({ fieldName: 'to_phrase', type: 'string', length: 120 })
  toPhrase!: string

  /** « en France ». */
  @Property({ fieldName: 'in_phrase', type: 'string', length: 120 })
  inPhrase!: string

  @Property({ fieldName: 'display_currency', type: 'string', length: 3, columnType: 'varchar(3)' })
  displayCurrency!: ForeignCurrency

  @Property({ fieldName: 'flag_emoji', type: 'string', length: 16, nullable: true })
  flagEmoji?: string | null

  @Property({ fieldName: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number = 0

  @Property({ fieldName: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ fieldName: 'created_at', type: 'Date' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updated_at', type: 'Date', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
