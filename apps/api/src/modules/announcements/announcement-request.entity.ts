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
 * La demande d'une boutique pour une annonce, payée d'avance.
 *
 * Même circuit que les bannières : le portefeuille est débité au dépôt, un
 * refus ou une annulation rembourse. Payer d'abord est ce qui rend la file
 * d'attente sérieuse — une demande qu'on ne peut pas payer n'existe pas.
 */
@Entity({ tableName: 'announcement_requests' })
@Index({ properties: ['supplier', 'createdAt'] })
export class AnnouncementRequest {
  [OptionalProps]?: 'id' | 'status' | 'subtitle' | 'imageUrl' | 'targetId' | 'rejectionReason' | 'announcement' | 'paidAt' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => Supplier, { fieldName: 'supplier_id', deleteRule: 'cascade' })
  supplier!: Rel<Supplier>

  @Property()
  title!: string

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

  /** Prix figé au dépôt, FCFA : changer l'offre ne change pas les demandes. */
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
