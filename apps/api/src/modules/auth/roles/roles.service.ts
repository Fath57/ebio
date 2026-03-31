import type { Rel } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { User } from '../auth.entity'
import { Permission } from '../entities/permission.entity'
import { Role } from '../entities/role.entity'

@Injectable()
export class RolesService {
  constructor(private readonly em: EntityManager) {}

  async findAll(): Promise<Role[]> {
    return this.em.find(Role, {}, { populate: ['permissions'], orderBy: { name: 'ASC' } })
  }

  async findById(id: string): Promise<Role> {
    const role = await this.em.findOne(Role, { id }, { populate: ['permissions'] })
    if (!role)
      throw new NotFoundException('Role introuvable')
    return role
  }

  async create(data: { name: string, description?: string, permissionIds?: string[] }): Promise<Role> {
    const existing = await this.em.findOne(Role, { name: data.name })
    if (existing)
      throw new ConflictException('Ce role existe deja')

    const role = this.em.create(Role, {
      name: data.name.toUpperCase(),
      description: data.description,
    })

    if (data.permissionIds?.length) {
      const permissions = await this.em.find(Permission, { id: { $in: data.permissionIds } })
      role.permissions.set(permissions)
    }

    await this.em.flush()
    return role
  }

  async update(id: string, data: { name?: string, description?: string, permissionIds?: string[] }): Promise<Role> {
    const role = await this.findById(id)

    if (data.name)
      role.name = data.name.toUpperCase()
    if (data.description !== undefined)
      role.description = data.description

    if (data.permissionIds) {
      const permissions = await this.em.find(Permission, { id: { $in: data.permissionIds } })
      role.permissions.set(permissions)
    }

    await this.em.flush()
    return role
  }

  async delete(id: string): Promise<void> {
    const role = await this.findById(id)
    if (['BUYER', 'SUPPLIER', 'ADMIN'].includes(role.name)) {
      throw new ConflictException('Impossible de supprimer un role systeme')
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
      throw new ConflictException('Cette permission existe deja')

    const permission = this.em.create(Permission, data)
    await this.em.flush()
    return permission
  }
}
