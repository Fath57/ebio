import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { config } from '../../config/env.config'
import { User, UserRole } from '../auth/auth.entity'
import { CaslAbilityFactory } from '../auth/casl/casl-ability.factory'
import { EmailService } from '../email/email.service'

export type InboxQueueKey = 'bannerRequests' | 'supplierValidations' | 'courierApplications' | 'withdrawals' | 'disputes'

export interface InboxQueue {
  key: InboxQueueKey
  count: number
}

interface QueueDefinition {
  key: InboxQueueKey
  /** Permission needed to act on the queue. */
  subject: 'Banner' | 'Supplier' | 'CourierProfile' | 'Withdrawal' | 'Order'
  sql: string
  label: string
  path: string
}

const QUEUES: QueueDefinition[] = [
  { key: 'bannerRequests', subject: 'Banner', sql: `SELECT COUNT(*)::int AS n FROM banner_requests WHERE status = 'PENDING'`, label: 'Demandes de bannière à valider', path: '/admin/bannieres/demandes' },
  { key: 'supplierValidations', subject: 'Supplier', sql: `SELECT COUNT(*)::int AS n FROM suppliers WHERE validation_status = 'PENDING'`, label: 'Boutiques à valider', path: '/admin/validations' },
  { key: 'courierApplications', subject: 'CourierProfile', sql: `SELECT COUNT(*)::int AS n FROM courier_profiles WHERE validation_status = 'PENDING'`, label: 'Candidatures livreur', path: '/admin/livreurs' },
  { key: 'withdrawals', subject: 'Withdrawal', sql: `SELECT COUNT(*)::int AS n FROM withdrawal_requests WHERE status = 'PENDING'`, label: 'Reversements à payer', path: '/admin/reversements' },
  { key: 'disputes', subject: 'Order', sql: `SELECT COUNT(*)::int AS n FROM disputes WHERE status = 'OPEN'`, label: 'Litiges ouverts', path: '/admin/commandes' },
]

/**
 * What the back-office team has to deal with: pending queues, filtered by
 * each member's permissions. Shown on the dashboard, mailed every morning,
 * and mailed at once for paid banner requests.
 */
@Injectable()
export class StaffInboxService {
  private readonly logger = new Logger(StaffInboxService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly abilities: CaslAbilityFactory,
    private readonly email: EmailService,
  ) {}

  async countAll(): Promise<Map<InboxQueueKey, number>> {
    const counts = new Map<InboxQueueKey, number>()
    for (const queue of QUEUES) {
      const rows = await this.em.getConnection().execute(queue.sql) as Array<{ n: number }>
      counts.set(queue.key, Number(rows[0]?.n ?? 0))
    }
    return counts
  }

  /** Queues this member may act on, with their current size. */
  async queuesFor(user: User, counts?: Map<InboxQueueKey, number>): Promise<InboxQueue[]> {
    const ability = await this.abilities.createForUser(user)
    const all = counts ?? await this.countAll()
    return QUEUES
      .filter(queue => ability.can('manage', queue.subject))
      .map(queue => ({ key: queue.key, count: all.get(queue.key) ?? 0 }))
  }

  /** Immediate alert: a shop just paid for a banner and expects an answer within a day. */
  async notifyNewBannerRequest(details: { shopName: string, title: string, durationDays: number, price: number }): Promise<void> {
    const recipients = await this.recipientsFor('Banner')
    await Promise.all(recipients.map(user => this.safeSend(user.email, 'Nouvelle demande de bannière à valider', 'banner-request-new', {
      userName: user.name,
      ...details,
      reviewUrl: `${config.clients.webApp.url}/admin/bannieres/demandes`,
    })))
  }

  /** Morning digest: one mail per member, only the queues they handle and that are not empty. */
  async sendDailyDigest(): Promise<number> {
    const counts = await this.countAll()
    const staff = await this.em.find(User, { role: UserRole.ADMIN, status: 'ACTIVE' })
    let sent = 0
    for (const user of staff) {
      const queues = (await this.queuesFor(user, counts)).filter(q => q.count > 0)
      if (queues.length === 0) {
        continue
      }
      const lines = queues.map((q) => {
        const def = QUEUES.find(d => d.key === q.key)!
        return { label: def.label, count: q.count, url: `${config.clients.webApp.url}${def.path}` }
      })
      await this.safeSend(user.email, `eBio — ${lines.reduce((s, l) => s + l.count, 0)} élément(s) à traiter`, 'staff-digest', { userName: user.name, lines })
      sent += 1
    }
    return sent
  }

  @Cron('0 7 * * *', { timeZone: 'Africa/Porto-Novo' })
  async dailyDigestCron(): Promise<void> {
    try {
      const sent = await this.sendDailyDigest()
      this.logger.log(`Staff digest sent to ${sent} member(s)`)
    }
    catch (error) {
      this.logger.error('Staff digest failed', error instanceof Error ? error.stack : String(error))
    }
  }

  private async recipientsFor(subject: QueueDefinition['subject']): Promise<User[]> {
    const staff = await this.em.find(User, { role: UserRole.ADMIN, status: 'ACTIVE' })
    const allowed: User[] = []
    for (const user of staff) {
      const ability = await this.abilities.createForUser(user)
      if (ability.can('manage', subject)) {
        allowed.push(user)
      }
    }
    return allowed
  }

  private async safeSend(to: string, subject: string, template: 'banner-request-new' | 'staff-digest', data: Record<string, unknown>): Promise<void> {
    try {
      await this.email.sendTemplatedEmail({ to, subject, template, data })
    }
    catch (error) {
      this.logger.error(`Staff e-mail to ${to} failed`, error instanceof Error ? error.message : String(error))
    }
  }
}
