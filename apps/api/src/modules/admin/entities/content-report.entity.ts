import type { Rel } from '@mikro-orm/core'
import {
  Entity,
  Enum,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,

} from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'

export enum ReportTargetType {
  PRODUCT = 'PRODUCT',
  REVIEW = 'REVIEW',
  PUBLICATION = 'PUBLICATION',
  MESSAGE = 'MESSAGE',
}

export enum ReportStatus {
  PENDING = 'PENDING',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
}

@Entity({ tableName: 'content_reports' })
export class ContentReport {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => User, { fieldName: 'reporter_id' })
  reporter!: Rel<User>

  @Enum({ items: () => ReportTargetType })
  @Index()
  targetType!: ReportTargetType

  @Property({ fieldName: 'target_id', type: 'uuid' })
  @Index()
  targetId!: string

  @Property({ type: 'text' })
  reason!: string

  @Enum({ items: () => ReportStatus, default: ReportStatus.PENDING })
  @Index()
  status: ReportStatus = ReportStatus.PENDING

  @ManyToOne(() => User, { fieldName: 'resolved_by', nullable: true })
  resolvedBy?: Rel<User>

  @Property({ fieldName: 'admin_note', type: 'text', nullable: true })
  adminNote?: string

  @Property({ fieldName: 'resolved_at', nullable: true })
  resolvedAt?: Date

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()
}
