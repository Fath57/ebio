import type { AuditRow } from './audit.service'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { User, UserRole } from '../auth/auth.entity'
import { EmailService } from '../email/email.service'
import { AuditService } from './audit.service'

export interface AdminUserDetail {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: UserRole
  staffRole: { id: string, name: string } | null
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED'
  /** Effective standing: an expired suspension reads as active. */
  isBlocked: boolean
  statusReason: string | null
  suspendedUntil: Date | null
  statusChangedAt: Date | null
  statusChangedBy: { id: string, name: string | null } | null
  emailVerified: boolean
  lastLoginAt: Date | null
  createdAt: Date
  supplier: { id: string, shopName: string, validationStatus: string } | null
  courier: { id: string, validationStatus: string, isAvailable: boolean } | null
  ordersCount: number
  history: AuditRow[]
}

/**
 * Account-level sanctions from the back-office. Distinct from the supplier /
 * courier profile suspension (which only stops that activity): here the
 * person can no longer use any app. Sessions are kept on purpose: the guard
 * answers every call with a 403 carrying the reason, which the apps display,
 * whereas a revoked session would only yield a mute 401.
 */
@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
  ) {}

  async getDetail(userId: string): Promise<AdminUserDetail> {
    const user = await this.em.findOne(User, { id: userId }, { populate: ['userRole'] })
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable')
    }
    const [supplierRows, courierRows, orderRows, actorRows, history] = await Promise.all([
      this.em.getConnection().execute(
        `SELECT id, shop_name, validation_status FROM suppliers WHERE user_id = ? LIMIT 1`,
        [userId],
      ) as Promise<Array<Record<string, unknown>>>,
      this.em.getConnection().execute(
        `SELECT id, validation_status, is_available FROM courier_profiles WHERE user_id = ? LIMIT 1`,
        [userId],
      ) as Promise<Array<Record<string, unknown>>>,
      this.em.getConnection().execute(
        `SELECT COUNT(*) AS count FROM orders WHERE buyer_id = ?`,
        [userId],
      ) as Promise<Array<{ count: string }>>,
      user.statusChangedBy
        ? this.em.getConnection().execute(`SELECT id, name FROM users WHERE id = ?`, [user.statusChangedBy]) as Promise<Array<Record<string, unknown>>>
        : Promise.resolve([] as Array<Record<string, unknown>>),
      this.auditService.listForTarget('user', userId),
    ])
    const supplier = supplierRows[0]
    const courier = courierRows[0]
    const actor = actorRows[0]
    const staffRole = user.userRole as { id: string, name: string } | undefined

    return {
      id: user.id,
      name: user.name,
      email: user.email ?? null,
      phone: user.phone ?? null,
      role: user.role,
      staffRole: user.role === UserRole.ADMIN && staffRole?.name ? { id: staffRole.id, name: staffRole.name } : null,
      status: user.status,
      isBlocked: user.isBlocked(),
      statusReason: user.statusReason ?? null,
      suspendedUntil: user.suspendedUntil ?? null,
      statusChangedAt: user.statusChangedAt ?? null,
      statusChangedBy: user.statusChangedBy
        ? { id: user.statusChangedBy, name: (actor?.name as string) ?? null }
        : null,
      emailVerified: user.emailVerified,
      lastLoginAt: user.lastLoginAt ?? null,
      createdAt: user.createdAt,
      supplier: supplier
        ? { id: supplier.id as string, shopName: supplier.shop_name as string, validationStatus: supplier.validation_status as string }
        : null,
      courier: courier
        ? { id: courier.id as string, validationStatus: courier.validation_status as string, isAvailable: Boolean(courier.is_available) }
        : null,
      ordersCount: Number(orderRows[0]?.count ?? 0),
      history,
    }
  }

  async suspend(userId: string, actor: User, reason: string, until?: Date): Promise<AdminUserDetail> {
    const user = await this.loadTarget(userId, actor)
    if (until && until.getTime() <= Date.now()) {
      throw new BadRequestException('La date de fin de suspension doit être dans le futur')
    }
    user.status = 'SUSPENDED'
    user.statusReason = reason
    user.suspendedUntil = until
    user.statusChangedAt = new Date()
    user.statusChangedBy = actor.id
    await this.em.flush()
    await this.auditService.record({
      actorUserId: actor.id,
      action: 'USER_SUSPENDED',
      targetType: 'user',
      targetId: user.id,
      reason,
      payload: { until: until?.toISOString() ?? null },
    })
    await this.notifyStatus(user, 'account-suspended', { reason, until })
    this.logger.warn(`User ${user.id} suspended by ${actor.id}${until ? ` until ${until.toISOString()}` : ''}`)
    return this.getDetail(user.id)
  }

  async ban(userId: string, actor: User, reason: string): Promise<AdminUserDetail> {
    const user = await this.loadTarget(userId, actor)
    user.status = 'BANNED'
    user.statusReason = reason
    user.suspendedUntil = undefined
    user.statusChangedAt = new Date()
    user.statusChangedBy = actor.id
    await this.em.flush()
    await this.auditService.record({
      actorUserId: actor.id,
      action: 'USER_BANNED',
      targetType: 'user',
      targetId: user.id,
      reason,
    })
    await this.notifyStatus(user, 'account-suspended', { reason, until: undefined, permanent: true })
    this.logger.warn(`User ${user.id} banned by ${actor.id}`)
    return this.getDetail(user.id)
  }

  async reinstate(userId: string, actor: User, note?: string): Promise<AdminUserDetail> {
    const user = await this.loadTarget(userId, actor)
    if (user.status === 'ACTIVE') {
      throw new BadRequestException('Ce compte est déjà actif')
    }
    const previous = user.status
    user.status = 'ACTIVE'
    user.statusReason = undefined
    user.suspendedUntil = undefined
    user.statusChangedAt = new Date()
    user.statusChangedBy = actor.id
    await this.em.flush()
    await this.auditService.record({
      actorUserId: actor.id,
      action: 'USER_REINSTATED',
      targetType: 'user',
      targetId: user.id,
      reason: note,
      payload: { previous },
    })
    await this.notifyStatus(user, 'account-reinstated', {})
    this.logger.log(`User ${user.id} reinstated by ${actor.id}`)
    return this.getDetail(user.id)
  }

  private async loadTarget(userId: string, actor: User): Promise<User> {
    if (userId === actor.id) {
      throw new BadRequestException('Vous ne pouvez pas agir sur votre propre compte')
    }
    const user = await this.em.findOne(User, { id: userId })
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable')
    }
    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException('Retirez d\'abord ce membre de l\'équipe avant de bloquer son compte')
    }
    return user
  }

  private async notifyStatus(
    user: User,
    template: 'account-suspended' | 'account-reinstated',
    data: { reason?: string, until?: Date, permanent?: boolean },
  ): Promise<void> {
    if (!user.email || user.email.endsWith('@example.com')) {
      return
    }
    try {
      await this.emailService.sendTemplatedEmail({
        to: user.email,
        subject: template === 'account-reinstated' ? 'Votre compte eBio est réactivé' : 'Votre compte eBio est suspendu',
        template,
        data: {
          userName: user.name,
          reason: data.reason ?? '',
          permanent: data.permanent ?? false,
          until: data.until ? data.until.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '',
        },
      })
    }
    catch (error) {
      // The sanction stands even if the mail bounces.
      this.logger.error(`Status e-mail failed for user ${user.id}`, error)
    }
  }
}
