import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, Index, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { Supplier } from '../suppliers/supplier.entity'
import { Banner, BannerTargetType } from './banner.entity'

export enum BannerRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

/**
 * A shop's paid request for a home-carousel banner. The wallet is debited
 * when the request is filed; a rejection or a cancellation refunds it.
 */
@Entity({ tableName: 'banner_requests' })
@Index({ properties: ['supplier', 'createdAt'] })
export class BannerRequest {
  [OptionalProps]?: 'id' | 'status' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => Supplier, { fieldName: 'supplier_id', deleteRule: 'cascade' })
  supplier!: Rel<Supplier>

  @Property()
  title!: string

  @Property({ nullable: true })
  subtitle?: string | null

  @Property({ fieldName: 'image_url', length: 1024 })
  imageUrl!: string

  @Enum({ items: () => BannerTargetType, fieldName: 'target_type' })
  targetType!: BannerTargetType

  @Property({ fieldName: 'target_id', type: 'uuid', nullable: true })
  targetId?: string | null

  @Property({ fieldName: 'duration_days', type: 'int' })
  durationDays!: number

  /** Price snapshotted from the offer at request time, FCFA. */
  @Property({ type: 'int' })
  price!: number

  @Property({ fieldName: 'requested_start_at', type: 'Date', nullable: true })
  requestedStartAt?: Date | null

  @Enum({ items: () => BannerRequestStatus, default: BannerRequestStatus.PENDING })
  @Index()
  status: BannerRequestStatus = BannerRequestStatus.PENDING

  @Property({ fieldName: 'rejection_reason', length: 500, nullable: true })
  rejectionReason?: string | null

  @ManyToOne(() => Banner, { fieldName: 'banner_id', nullable: true })
  banner?: Rel<Banner> | null

  @Property({ fieldName: 'paid_at', type: 'Date', nullable: true })
  paidAt?: Date | null

  @Property({ fieldName: 'refunded_at', type: 'Date', nullable: true })
  refundedAt?: Date | null

  @Property({ fieldName: 'reviewed_by', nullable: true })
  reviewedBy?: string | null

  @Property({ fieldName: 'reviewed_at', type: 'Date', nullable: true })
  reviewedAt?: Date | null

  @Property({ fieldName: 'created_at', type: 'Date' })
  createdAt: Date = new Date()
}
