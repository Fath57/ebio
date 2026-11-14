import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, Index, ManyToOne, OneToOne, OptionalProps, PrimaryKeyProp, Property } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { Product } from '../../products/entities/product.entity'
import { ExportProfileStatus, ExportStorage } from '../contracts/terroir.contract'

/**
 * A product a shop offers for export (011), one row per product.
 *
 * The composition stays on the product; this carries what only export needs:
 * packed weight, size, shelf life, storage, allergens, a structured origin,
 * the label photo and the shop's three declarations. No manual review: the
 * status is recomputed from the export criteria on every save, when the
 * product sheet or the criteria settings change (`missingCriteria` keeps the
 * keys not met). eBio may withdraw a product; it stays WITHDRAWN until
 * reinstated.
 */
@Entity({ tableName: 'export_profiles' })
@Index({ name: 'export_profiles_status_idx', properties: ['status'] })
export class ExportProfile {
  [PrimaryKeyProp]?: 'product'
  [OptionalProps]?: 'status' | 'originPhotos' | 'missingCriteria' | 'noAllergens' | 'declaresFrenchLabel' | 'declaresDatesPrinted' | 'declaresSealedPackaging' | 'createdAt' | 'updatedAt' | 'hasBadge'

  @OneToOne(() => Product, { primary: true, owner: true, fieldName: 'product_id', deleteRule: 'cascade' })
  product!: Rel<Product>

  @Enum({ items: () => ExportProfileStatus, columnType: 'varchar(10)', default: ExportProfileStatus.INCOMPLETE })
  status: ExportProfileStatus = ExportProfileStatus.INCOMPLETE

  /** Keys of the export criteria not met at the last computation. */
  @Property({ fieldName: 'missing_criteria', type: 'json', columnType: 'jsonb', default: '[]' })
  missingCriteria: string[] = []

  /** Weight of one unit as shipped, packaging included. */
  @Property({ fieldName: 'packed_weight_g', type: 'integer', nullable: true })
  packedWeightG?: number | null

  @Property({ fieldName: 'length_cm', type: 'integer', nullable: true })
  lengthCm?: number | null

  @Property({ fieldName: 'width_cm', type: 'integer', nullable: true })
  widthCm?: number | null

  @Property({ fieldName: 'height_cm', type: 'integer', nullable: true })
  heightCm?: number | null

  @Property({ fieldName: 'shelf_life_days', type: 'integer', nullable: true })
  shelfLifeDays?: number | null

  @Enum({ items: () => ExportStorage, columnType: 'varchar(10)', nullable: true })
  storage?: ExportStorage | null

  /** Allergens as printed on the label, when the product sheet ticks none. */
  @Property({ type: 'string', length: 500, nullable: true })
  allergens?: string | null

  @Property({ fieldName: 'no_allergens', type: 'boolean', default: false })
  noAllergens: boolean = false

  @Property({ fieldName: 'origin_producer', type: 'string', length: 120, nullable: true })
  originProducer?: string | null

  @Property({ fieldName: 'origin_place', type: 'string', length: 120, nullable: true })
  originPlace?: string | null

  @Property({ fieldName: 'origin_year', type: 'smallint', nullable: true })
  originYear?: number | null

  @Property({ fieldName: 'origin_method', type: 'string', length: 300, nullable: true })
  originMethod?: string | null

  /** 0–3 public URLs (media context PRODUCT_PHOTO). */
  @Property({ fieldName: 'origin_photos', type: 'json', columnType: 'jsonb', default: '[]' })
  originPhotos: string[] = []

  @Property({ fieldName: 'label_photo', type: 'text', nullable: true })
  labelPhoto?: string | null

  @Property({ fieldName: 'declares_french_label', type: 'boolean', default: false })
  declaresFrenchLabel: boolean = false

  @Property({ fieldName: 'declares_dates_printed', type: 'boolean', default: false })
  declaresDatesPrinted: boolean = false

  @Property({ fieldName: 'declares_sealed_packaging', type: 'boolean', default: false })
  declaresSealedPackaging: boolean = false

  /** First time the product became exportable: the shop is told once. */
  @Property({ fieldName: 'exportable_since', type: 'Date', nullable: true })
  exportableSince?: Date | null

  @ManyToOne(() => User, { fieldName: 'withdrawn_by', nullable: true })
  withdrawnBy?: Rel<User> | null

  @Property({ fieldName: 'withdrawn_at', type: 'Date', nullable: true })
  withdrawnAt?: Date | null

  /** eBio's reason, sent to the shop; kept after a reinstatement for the record. */
  @Property({ fieldName: 'withdrawn_reason', type: 'string', length: 500, nullable: true })
  withdrawnReason?: string | null

  @Property({ fieldName: 'created_at', type: 'Date' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updated_at', type: 'Date', onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  /** « Terroir validé eBio »: exportable, with an origin to tell. */
  get hasBadge(): boolean {
    return this.status === ExportProfileStatus.EXPORTABLE && Boolean(this.originProducer || this.originPlace)
  }
}
