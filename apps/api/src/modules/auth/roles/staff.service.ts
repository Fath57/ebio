import type { Rel } from '@mikro-orm/core'
import { randomBytes } from 'node:crypto'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { config } from '../../../config/env.config'
import { AuditService } from '../../admin/audit.service'
import { EmailService } from '../../email/email.service'
import { User, UserRole, Verification } from '../auth.entity'
import { Role } from '../entities/role.entity'

/** An invitation link stays valid a week: staff onboarding is not a hot path. */
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface StaffMember {
  id: string
  name: string
  email: string
  phone: string | null
  role: { id: string, name: string } | null
  lastLoginAt: Date | null
  createdAt: Date
  /** True until the invitee has chosen a password and signed in once. */
  invitationPending: boolean
}

interface StaffRow {
  id: string
  name: string
  email: string
  phone: string | null
  role_id: string | null
  role_name: string | null
  last_login_at: Date | string | null
  created_at: Date | string
  has_credential: boolean
}

/**
 * Back-office team: who is staff (`role = ADMIN`) and which DB role shapes
 * their rights. Invitations reuse Better Auth's reset-password token so the
 * invitee lands on the existing "choose a password" page.
 */
@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly emailService: EmailService,
    private readonly auditService: AuditService,
  ) {}

  async list(): Promise<StaffMember[]> {
    const rows = await this.em.getConnection().execute(
      `SELECT u.id, u.name, u.email, u.phone, u.role_id, r.name AS role_name,
              u."lastLoginAt" AS last_login_at, u."createdAt" AS created_at,
              EXISTS (SELECT 1 FROM account a WHERE a."userId" = u.id AND a."providerId" = 'credential') AS has_credential
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.role = 'ADMIN'
       ORDER BY u.name ASC`,
    ) as StaffRow[]
    return rows.map(row => this.toMember(row))
  }

  async getById(userId: string): Promise<StaffMember> {
    const member = (await this.list()).find(m => m.id === userId)
    if (!member) {
      throw new NotFoundException('Membre de l\'équipe introuvable')
    }
    return member
  }

  /**
   * Creates the account (or promotes an existing app user), assigns the role
   * and e-mails an invitation. No password is set here: the invitee picks it
   * through the reset-password flow.
   */
  async invite(data: { name: string, email: string, roleId: string }, invitedBy: User): Promise<StaffMember> {
    const email = data.email.trim().toLowerCase()
    const role = await this.findRole(data.roleId)

    let user = await this.em.findOne(User, { email })
    if (user?.role === UserRole.ADMIN) {
      throw new ConflictException('Cette personne fait déjà partie de l\'équipe')
    }
    if (user) {
      // An existing buyer/supplier account joins the staff: same login, more rights.
      user.role = UserRole.ADMIN
      user.userRole = role as Rel<Role>
    }
    else {
      user = this.em.create(User, {
        name: data.name.trim(),
        email,
        emailVerified: true,
        role: UserRole.ADMIN,
        userRole: role as Rel<Role>,
      })
    }
    await this.em.flush()

    await this.sendInvitation(user, role, invitedBy)
    await this.auditService.record({ actorUserId: invitedBy.id, action: 'STAFF_INVITED', targetType: 'staff', targetId: user.id, payload: { email, role: role.name } })
    this.logger.log(`Staff member ${user.id} invited by ${invitedBy.id} with role ${role.name}`)
    return this.getById(user.id)
  }

  async resendInvitation(userId: string, invitedBy: User): Promise<void> {
    const user = await this.em.findOne(User, { id: userId, role: UserRole.ADMIN }, { populate: ['userRole'] })
    if (!user) {
      throw new NotFoundException('Membre de l\'équipe introuvable')
    }
    const role = user.userRole ? await this.findRole(user.userRole.id) : null
    await this.sendInvitation(user, role, invitedBy)
  }

  async changeRole(userId: string, roleId: string, actor: User): Promise<StaffMember> {
    if (userId === actor.id) {
      throw new BadRequestException('Vous ne pouvez pas modifier votre propre rôle')
    }
    const user = await this.em.findOne(User, { id: userId, role: UserRole.ADMIN })
    if (!user) {
      throw new NotFoundException('Membre de l\'équipe introuvable')
    }
    const role = await this.findRole(roleId)
    await this.assertNotLastSuperAdmin(user, role)
    const previous = user.userRole ? (await this.findRole((user.userRole as Rel<Role>).id)).name : null
    user.userRole = role as Rel<Role>
    await this.em.flush()
    await this.auditService.record({ actorUserId: actor.id, action: 'STAFF_ROLE_CHANGED', targetType: 'staff', targetId: userId, payload: { from: previous, to: role.name } })
    return this.getById(userId)
  }

  /** Leaves the staff: the account stays, back as a plain buyer. */
  async remove(userId: string, actor: User): Promise<void> {
    if (userId === actor.id) {
      throw new BadRequestException('Vous ne pouvez pas vous retirer vous-même de l\'équipe')
    }
    const user = await this.em.findOne(User, { id: userId, role: UserRole.ADMIN })
    if (!user) {
      throw new NotFoundException('Membre de l\'équipe introuvable')
    }
    await this.assertNotLastSuperAdmin(user, null)
    user.role = UserRole.BUYER
    user.userRole = undefined
    await this.em.flush()
    // Sessions carry the enum role: drop them so the demotion applies at once.
    await this.em.getConnection().execute(`DELETE FROM session WHERE "userId" = ?`, [userId])
    await this.auditService.record({ actorUserId: actor.id, action: 'STAFF_REMOVED', targetType: 'staff', targetId: userId })
  }

  private async sendInvitation(user: User, role: Role | null, invitedBy: User): Promise<void> {
    const token = randomBytes(24).toString('base64url')
    this.em.create(Verification, {
      identifier: `reset-password:${token}`,
      value: user.id,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    })
    await this.em.flush()

    const setPasswordUrl = `${config.clients.webApp.url}/reset-password?token=${token}`
    await this.emailService.sendTemplatedEmail({
      to: user.email,
      subject: 'Bienvenue dans l\'équipe eBio',
      template: 'staff-invitation',
      data: {
        userName: user.name,
        invitedBy: invitedBy.name,
        roleName: role?.name ?? 'Super administrateur',
        roleDescription: role?.description ?? '',
        setPasswordUrl,
      },
    })
  }

  /** A super admin without a DB role is one too: never lock the last one out. */
  private async assertNotLastSuperAdmin(user: User, nextRole: Role | null): Promise<void> {
    const wasSuperAdmin = !user.userRole || (await this.findRole((user.userRole as Rel<Role>).id)).name === 'ADMIN'
    const staysSuperAdmin = nextRole?.name === 'ADMIN'
    if (!wasSuperAdmin || staysSuperAdmin) {
      return
    }
    const rows = await this.em.getConnection().execute(
      `SELECT COUNT(*) AS count FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.role = 'ADMIN' AND u.id <> ? AND (u.role_id IS NULL OR r.name = 'ADMIN')`,
      [user.id],
    ) as Array<{ count: string }>
    if (Number(rows[0]?.count ?? 0) === 0) {
      throw new BadRequestException('Impossible : ce membre est le dernier super administrateur')
    }
  }

  private async findRole(roleId: string): Promise<Role> {
    const role = await this.em.findOne(Role, { id: roleId })
    if (!role || ['BUYER', 'SUPPLIER', 'COURIER'].includes(role.name)) {
      throw new NotFoundException('Rôle introuvable')
    }
    return role
  }

  private toMember(row: StaffRow): StaffMember {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone ?? null,
      role: row.role_id && row.role_name ? { id: row.role_id, name: row.role_name } : null,
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at) : null,
      createdAt: new Date(row.created_at),
      invitationPending: !row.has_credential && !row.last_login_at,
    }
  }
}
