import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { AuditLog } from './entities/audit-log.entity'

export interface AuditEntry {
  actorUserId: string
  action: string
  targetType: 'user' | 'staff' | 'role' | 'delivery' | 'supplier' | 'courier' | 'order' | 'settings' | 'product'
  targetId: string
  reason?: string
  payload?: Record<string, unknown>
}

export interface AuditRow {
  id: string
  action: string
  targetType: string
  targetId: string
  reason: string | null
  payload: Record<string, unknown> | null
  createdAt: Date
  actor: { id: string, name: string | null }
}

const PAGE_LIMIT = 50

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name)

  constructor(private readonly em: EntityManager) {}

  /**
   * Writes with a forked manager so a caller's pending unit of work (or its
   * rollback) never swallows the trace. Failures are logged, never thrown:
   * auditing must not break the action it describes.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      const em = this.em.fork()
      em.create(AuditLog, entry)
      await em.flush()
    }
    catch (error) {
      this.logger.error(`Audit write failed for ${entry.action} on ${entry.targetType}:${entry.targetId}`, error)
    }
  }

  async listForTarget(targetType: string, targetId: string, limit = PAGE_LIMIT): Promise<AuditRow[]> {
    return this.query('a.target_type = ? AND a.target_id = ?', [targetType, targetId], limit)
  }

  async listByActor(actorUserId: string, limit = PAGE_LIMIT): Promise<AuditRow[]> {
    return this.query('a.actor_user_id = ?', [actorUserId], limit)
  }

  async listRecent(limit = PAGE_LIMIT): Promise<AuditRow[]> {
    return this.query('1 = 1', [], limit)
  }

  private async query(where: string, params: unknown[], limit: number): Promise<AuditRow[]> {
    const rows = await this.em.getConnection().execute(
      `SELECT a.id, a.action, a.target_type, a.target_id, a.reason, a.payload, a.created_at,
              u.id AS actor_id, u.name AS actor_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id::text = a.actor_user_id
       WHERE ${where}
       ORDER BY a.created_at DESC
       LIMIT ${Math.min(limit, 200)}`,
      params,
    ) as Array<Record<string, unknown>>
    return rows.map(row => ({
      id: row.id as string,
      action: row.action as string,
      targetType: row.target_type as string,
      targetId: row.target_id as string,
      reason: (row.reason as string) ?? null,
      payload: (row.payload as Record<string, unknown>) ?? null,
      createdAt: new Date(row.created_at as string),
      actor: { id: (row.actor_id as string) ?? (row.actor_user_id as string), name: (row.actor_name as string) ?? null },
    }))
  }
}
