import type { Rel } from '@mikro-orm/core'
import { Collection, Entity, Enum, Index, ManyToOne, OneToMany, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { Supplier } from '../../suppliers/supplier.entity'
import { ExportPackStatus } from '../contracts/terroir.contract'
import { ExportPackItem } from './export-pack-item.entity'

/**
 * A terroir pack (011): a shop's products at a price it sets, or eBio's
 * selection across shops (`supplier` null) at a price eBio sets. Bought as one
 * article, unfolded into ordinary lines per shop at checkout.
 */
@Entity({ tableName: 'export_packs' })
@Index({ name: 'export_packs_supplier_idx', properties: ['supplier'] })
export class ExportPack {
  [OptionalProps]?: 'id' | 'status' | 'missingCriteria' | 'photos' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  /** Null: composed by eBio, possibly from several shops. */
  @ManyToOne(() => Supplier, { fieldName: 'supplier_id', nullable: true })
  supplier?: Rel<Supplier> | null

  @Property({ type: 'string', length: 120 })
  name!: string

  @Property({ type: 'text', nullable: true })
  description?: string | null

  @Property({ type: 'json', columnType: 'jsonb', default: '[]' })
  photos: string[] = []

  /** numeric(12,2), a string from the driver; Number() at the edges. */
  @Property({ columnType: 'numeric(12,2)' })
  price!: string

  /** Computed from its criteria (every product exportable, name, price, photo); WITHDRAWN and RETIRED stick. */
  @Enum({ items: () => ExportPackStatus, columnType: 'varchar(10)', default: ExportPackStatus.INCOMPLETE })
  status: ExportPackStatus = ExportPackStatus.INCOMPLETE

  /** Keys of the pack criteria not met at the last computation. */
  @Property({ fieldName: 'missing_criteria', type: 'json', columnType: 'jsonb', default: '[]' })
  missingCriteria: string[] = []

  /** eBio's reason, sent to the shop; kept after a reinstatement for the record. */
  @Property({ fieldName: 'withdrawn_reason', type: 'string', length: 500, nullable: true })
  withdrawnReason?: string | null

  @ManyToOne(() => User, { fieldName: 'withdrawn_by', nullable: true })
  withdrawnBy?: Rel<User> | null

  @Property({ fieldName: 'withdrawn_at', type: 'Date', nullable: true })
  withdrawnAt?: Date | null

  @OneToMany(() => ExportPackItem, item => item.pack, { orphanRemoval: true })
  items = new Collection<ExportPackItem>(this)

  @Property({ fieldName: 'created_at', type: 'Date' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updated_at', type: 'Date', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
