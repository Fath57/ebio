import type { Rel } from '@mikro-orm/core'
import type { ExportChecklist } from '../contracts/terroir.contract'
import { Entity, Enum, Index, ManyToOne, OneToOne, OptionalProps, PrimaryKeyProp, Property } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { Product } from '../../products/entities/product.entity'
import { ExportProfileStatus } from '../contracts/terroir.contract'

/**
 * A shop's request to sell one product abroad, and eBio's answer (011).
 *
 * One row per product. The composition stays on the product; this carries
 * what only export needs — packed weight, size, shelf life, a structured
 * origin, the label photo — and the checklist eBio ticked, by whom, when.
 * Any change to the weight, the composition or the label sends it back to
 * PENDING (FR-002).
 */
@Entity({ tableName: 'export_profiles' })
@Index({ name: 'export_profiles_status_idx', properties: ['status'] })
export class ExportProfile {
  [PrimaryKeyProp]?: 'product'
  [OptionalProps]?: 'status' | 'originPhotos' | 'checklist' | 'createdAt' | 'updatedAt' | 'hasBadge'

  @OneToOne(() => Product, { primary: true, owner: true, fieldName: 'product_id', deleteRule: 'cascade' })
  product!: Rel<Product>

  @Enum({ items: () => ExportProfileStatus, columnType: 'varchar(10)', default: ExportProfileStatus.PENDING })
  status: ExportProfileStatus = ExportProfileStatus.PENDING

  /** Weight of one unit as shipped, packaging included. */
  @Property({ fieldName: 'packed_weight_g', type: 'integer' })
  packedWeightG!: number

  @Property({ fieldName: 'length_cm', type: 'integer', nullable: true })
  lengthCm?: number | null

  @Property({ fieldName: 'width_cm', type: 'integer', nullable: true })
  widthCm?: number | null

  @Property({ fieldName: 'height_cm', type: 'integer', nullable: true })
  heightCm?: number | null

  @Property({ fieldName: 'shelf_life_days', type: 'integer' })
  shelfLifeDays!: number

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

  /** Key → ticked, as eBio left it at the last review. */
  @Property({ type: 'json', columnType: 'jsonb', default: '{}' })
  checklist: ExportChecklist = {}

  @ManyToOne(() => User, { fieldName: 'reviewed_by', nullable: true })
  reviewedBy?: Rel<User> | null

  @Property({ fieldName: 'reviewed_at', type: 'Date', nullable: true })
  reviewedAt?: Date | null

  @Property({ fieldName: 'rejection_reason', type: 'string', length: 500, nullable: true })
  rejectionReason?: string | null

  @Property({ fieldName: 'created_at', type: 'Date' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updated_at', type: 'Date', onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  /** « Terroir validé eBio »: approved, with an origin to tell. */
  get hasBadge(): boolean {
    return this.status === ExportProfileStatus.APPROVED && Boolean(this.originProducer || this.originPlace)
  }
}
