import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, Index, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'

export enum CampaignStatus {
  DRAFT = 'DRAFT',
  /** Waiting for its hour. */
  SCHEDULED = 'SCHEDULED',
  SENDING = 'SENDING',
  SENT = 'SENT',
  CANCELLED = 'CANCELLED',
}

/**
 * Who a campaign goes to.
 *
 * Deliberately few, and each one answerable from data we already hold. A
 * segment nobody can explain is a segment nobody trusts, and "everyone" sent
 * twice is how an app gets uninstalled.
 */
export enum CampaignSegment {
  /** Everyone using that app. */
  ALL = 'ALL',
  /** Ordered in the last 30 days. */
  ACTIVE = 'ACTIVE',
  /** Has an account, has never ordered. */
  NEVER_ORDERED = 'NEVER_ORDERED',
  /** Ordered once, nothing for 60 days. */
  LAPSED = 'LAPSED',
  /** Something in the basket right now. */
  WITH_CART = 'WITH_CART',
}

/**
 * A message sent to many people at once, on purpose.
 *
 * Everything else the app sends is a consequence — an order moved, a courier
 * accepted. This is the only kind written by someone who decided to write it,
 * so it carries what that needs: a picture, a moment, and a count of who it
 * actually reached.
 */
@Entity({ tableName: 'notification_campaigns' })
export class Campaign {
  [OptionalProps]?: 'id' | 'status' | 'createdAt' | 'recipients' | 'sent' | 'failed' | 'segment'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ length: 120 })
  title!: string

  @Property({ length: 500 })
  body!: string

  /** Shown in the tray where the phone supports it; optional. */
  @Property({ fieldName: 'image_url', length: 1024, nullable: true })
  imageUrl?: string

  /** Which app: 'client', 'supplier' or 'courier'. */
  @Property({ length: 20 })
  app!: string

  @Enum({ items: () => CampaignSegment })
  segment: CampaignSegment = CampaignSegment.ALL

  /** Where tapping it leads: SUPPLIER | PRODUCT | URL | NONE. */
  @Property({ fieldName: 'target_type', length: 20 })
  targetType!: string

  @Property({ fieldName: 'target_id', length: 1024, nullable: true })
  targetId?: string

  @Enum({ items: () => CampaignStatus })
  status: CampaignStatus = CampaignStatus.DRAFT

  /** When it should go out; null means as soon as it is sent by hand. */
  @Index()
  @Property({ fieldName: 'scheduled_at', type: 'Date', nullable: true })
  scheduledAt?: Date | null

  @Property({ fieldName: 'sent_at', type: 'Date', nullable: true })
  sentAt?: Date | null

  /** How many the segment matched when it went out. */
  @Property({ default: 0 })
  recipients: number = 0

  /** How many were actually handed to the operator, and how many were not. */
  @Property({ default: 0 })
  sent: number = 0

  @Property({ default: 0 })
  failed: number = 0

  @ManyToOne(() => User, { fieldName: 'created_by', nullable: true })
  createdBy?: Rel<User> | null

  @Property({ fieldName: 'created_at' })
  createdAt: Date = new Date()
}
