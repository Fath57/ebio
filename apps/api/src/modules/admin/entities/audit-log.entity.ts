import { Entity, Index, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'

/**
 * Append-only trace of what the staff did: who, what, on which record, why.
 * Read back on user and team pages; never edited or deleted.
 */
@Entity({ tableName: 'audit_logs' })
export class AuditLog {
  [OptionalProps]?: 'id' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  /** Staff member who acted (user id). */
  @Property({ fieldName: 'actor_user_id' })
  @Index()
  actorUserId!: string

  /** Stable verb, e.g. USER_SUSPENDED, STAFF_INVITED, ROLE_UPDATED. */
  @Property()
  action!: string

  /** Kind of record acted upon: user, staff, role, delivery, supplier, courier… */
  @Property({ fieldName: 'target_type' })
  targetType!: string

  @Property({ fieldName: 'target_id' })
  @Index()
  targetId!: string

  @Property({ nullable: true })
  reason?: string

  @Property({ type: 'jsonb', nullable: true })
  payload?: Record<string, unknown>

  @Property({ fieldName: 'created_at' })
  createdAt: Date = new Date()
}
