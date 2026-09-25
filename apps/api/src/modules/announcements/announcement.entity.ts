import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, Index, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { BannerTargetType } from '../banners/banner.entity'
import { Supplier } from '../suppliers/supplier.entity'

export enum AnnouncementOrigin {
  /** Published by eBio, with no payment. */
  PLATFORM = 'PLATFORM',
  /** Requested and paid for by a shop. */
  SUPPLIER = 'SUPPLIER',
}

/**
 * What appears when the app opens.
 *
 * An announcement interrupts: it stands in front of what the buyer came to do.
 * That is why it is dated, why it does not come back before a configured
 * delay, and why only one goes through at a time — two modals back to back and
 * nobody reads either.
 */
@Entity({ tableName: 'announcements' })
@Index({ properties: ['active', 'startsAt'] })
export class Announcement {
  [OptionalProps]?: 'id' | 'title' | 'active' | 'priority' | 'subtitle' | 'imageUrl' | 'targetId' | 'supplier' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  /** Null when the announcement is a poster alone: it carries its own text. */
  @Property({ nullable: true })
  title?: string | null

  @Property({ length: 500, nullable: true })
  subtitle?: string | null

  @Property({ fieldName: 'image_url', length: 1024, nullable: true })
  imageUrl?: string | null

  @Enum({ items: () => BannerTargetType, fieldName: 'target_type' })
  targetType!: BannerTargetType

  @Property({ fieldName: 'target_id', length: 1024, nullable: true })
  targetId?: string | null

  @Enum({ items: () => AnnouncementOrigin })
  origin!: AnnouncementOrigin

  /** The shop that paid for it; null for an eBio announcement. */
  @ManyToOne(() => Supplier, { fieldName: 'supplier_id', nullable: true })
  supplier?: Rel<Supplier> | null

  @Property({ fieldName: 'starts_at' })
  startsAt!: Date

  @Property({ fieldName: 'ends_at' })
  endsAt!: Date

  @Property({ default: true })
  active: boolean = true

  /**
   * Who goes first when several announcements are running.
   *
   * Only one shows per opening: the highest priority one the buyer has not
   * seen recently.
   */
  @Property({ default: 0 })
  priority: number = 0

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
