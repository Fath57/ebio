import type { Rel } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { User } from '../auth.entity'
import { Permission } from '../entities/permission.entity'
import { Role } from '../entities/role.entity'

/** The super-admin role: its permissions are `manage:all` and never change. */
const SYSTEM_ROLE = 'ADMIN'
/** Audience roles of the apps, kept for the seed but out of the staff UI. */
const APP_ROLES = new Set(['BUYER', 'SUPPLIER', 'COURIER'])

@Injectable()
export class RolesService {
  constructor(private readonly em: EntityManager) {}

  async findAll(): Promise<Role[]> {
    return this.em.find(Role, {}, { populate: ['permissions'], orderBy: { name: 'ASC' } })
  }

  /** Staff roles only, with how many members hold each one. */
  async findAllWithCounts(): Promise<Array<{ role: Role, usersCount: number }>> {
    const roles = (await this.findAll()).filter(role => !APP_ROLES.has(role.name))
    const rows = await this.em.getConnection().execute(
      `SELECT role_id, COUNT(*) AS count FROM users WHERE role = 'ADMIN' AND role_id IS NOT NULL GROUP BY role_id`,
    ) as Array<{ role_id: string, count: string }>
    const counts = new Map(rows.map(r => [r.role_id, Number(r.count)]))
    return roles.map(role => ({ role, usersCount: counts.get(role.id) ?? 0 }))
  }

  async countUsers(roleId: string): Promise<number> {
    const rows = await this.em.getConnection().execute(
      `SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN' AND role_id = ?`,
      [roleId],
    ) as Array<{ count: string }>
    return Number(rows[0]?.count ?? 0)
  }

  async findById(id: string): Promise<Role> {
    const role = await this.em.findOne(Role, { id }, { populate: ['permissions'] })
    if (!role)
      throw new NotFoundException('Rôle introuvable')
    return role
  }

  async create(data: { name: string, description?: string, permissionIds?: string[] }): Promise<Role> {
    const name = normalizeName(data.name)
    const existing = await this.em.findOne(Role, { name })
    if (existing)
      throw new ConflictException('Ce rôle existe déjà')

    const role = this.em.create(Role, { name, description: data.description })
    if (data.permissionIds?.length) {
      role.permissions.set(await this.findPermissions(data.permissionIds))
    }
    await this.em.flush()
    return role
  }

  async update(id: string, data: { name?: string, description?: string, permissionIds?: string[] }): Promise<Role> {
    const role = await this.findById(id)
    if (role.name === SYSTEM_ROLE && (data.name || data.permissionIds)) {
      throw new ConflictException('Le rôle super administrateur ne peut pas être modifié')
    }

    if (data.name) {
      const name = normalizeName(data.name)
      const clash = await this.em.findOne(Role, { name })
      if (clash && clash.id !== role.id)
        throw new ConflictException('Ce rôle existe déjà')
      role.name = name
    }
    if (data.description !== undefined)
      role.description = data.description
    if (data.permissionIds) {
      role.permissions.set(await this.findPermissions(data.permissionIds))
    }

    await this.em.flush()
    return role
  }

  async delete(id: string): Promise<void> {
    const role = await this.findById(id)
    if (role.name === SYSTEM_ROLE || APP_ROLES.has(role.name)) {
      throw new ConflictException('Impossible de supprimer un rôle système')
    }
    const holders = await this.countUsers(role.id)
    if (holders > 0) {
      throw new ConflictException(`Ce rôle est encore attribué à ${holders} membre(s) de l'équipe`)
    }
    this.em.remove(role)
    await this.em.flush()
  }

  async assignRoleToUser(userId: string, roleId: string): Promise<User> {
    const user = await this.em.findOne(User, { id: userId })
    if (!user)
      throw new NotFoundException('Utilisateur introuvable')

    const role = await this.findById(roleId)
    user.userRole = role as Rel<Role>
    await this.em.flush()
    return user
  }

  async getAllPermissions(): Promise<Permission[]> {
    return this.em.find(Permission, {}, { orderBy: { subject: 'ASC', action: 'ASC' } })
  }

  async createPermission(data: {
    action: string
    subject: string
    conditions?: Record<string, unknown>
    description?: string
  }): Promise<Permission> {
    const existing = await this.em.findOne(Permission, { action: data.action, subject: data.subject })
    if (existing)
      throw new ConflictException('Cette permission existe déjà')

    const permission = this.em.create(Permission, data)
    await this.em.flush()
    return permission
  }

  private async findPermissions(ids: string[]): Promise<Permission[]> {
    return this.em.find(Permission, { id: { $in: ids } })
  }
}

/** Role names are stored upper-case with underscores, like the seeded ones. */
function normalizeName(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, '_')
}
