import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, Index, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { BannerTargetType } from '../banners/banner.entity'
import { Supplier } from '../suppliers/supplier.entity'
import { Announcement } from './announcement.entity'

export enum AnnouncementRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

/**
 * A shop's request for an announcement, paid up front.
 *
 * Same circuit as the banners: the wallet is debited when the request is
 * filed, a rejection or a cancellation refunds it. Paying first is what makes
 * the queue serious — a request that cannot be paid does not exist.
 */
@Entity({ tableName: 'announcement_requests' })
@Index({ properties: ['supplier', 'createdAt'] })
export class AnnouncementRequest {
  [OptionalProps]?: 'id' | 'title' | 'status' | 'subtitle' | 'imageUrl' | 'targetId' | 'rejectionReason' | 'announcement' | 'paidAt' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => Supplier, { fieldName: 'supplier_id', deleteRule: 'cascade' })
  supplier!: Rel<Supplier>

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

  @Property({ fieldName: 'duration_days', type: 'int' })
  durationDays!: number

  /** Price frozen when filed, FCFA: changing the offer leaves requests alone. */
  @Property({ type: 'int' })
  price!: number

  @Enum({ items: () => AnnouncementRequestStatus, default: AnnouncementRequestStatus.PENDING })
  @Index()
  status: AnnouncementRequestStatus = AnnouncementRequestStatus.PENDING

  @Property({ fieldName: 'rejection_reason', length: 500, nullable: true })
  rejectionReason?: string | null

  @ManyToOne(() => Announcement, { fieldName: 'announcement_id', nullable: true })
  announcement?: Rel<Announcement> | null

  @Property({ fieldName: 'paid_at', nullable: true })
  paidAt?: Date | null

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()
}
