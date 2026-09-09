import type { Role } from '../entities/role.entity'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { CanManage } from '../../../common/decorators/check-permissions.decorator'
import { Roles } from '../../../common/decorators/roles.decorator'
import { CaslGuard } from '../../../common/guards/casl.guard'
import { RolesGuard } from '../../../common/guards/roles.guard'
import { AuthGuard } from '../auth.guard'
import { ADMIN_PERMISSIONS_CATALOG, permissionKey } from '../casl/admin-permissions.catalog'
import { RolesService } from './roles.service'

const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(50),
  description: z.string().trim().max(200).optional(),
  permissionIds: z.array(z.string().uuid()).optional(),
}).meta({ title: 'CreateRole', description: 'A staff role and the permissions it grants' })

const updateRoleSchema = createRoleSchema.partial().meta({ title: 'UpdateRole' })

const assignRoleSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
}).meta({ title: 'AssignRole' })

function toRoleResponse(role: Role, usersCount: number) {
  return {
    id: role.id,
    name: role.name,
    description: role.description ?? null,
    isDefault: role.isDefault,
    /** The super-admin role cannot be edited or deleted. */
    isSystem: role.name === 'ADMIN',
    usersCount,
    permissions: role.permissions.getItems().map(p => ({
      id: p.id,
      action: p.action,
      subject: p.subject,
      description: p.description ?? null,
    })),
  }
}

/**
 * Staff roles of the back-office. Session-authenticated like every other
 * admin route (the previous JWT guard only served the mobile chat token).
 */
@Controller('admin/roles')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
@CanManage('Staff')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  async findAll() {
    const roles = await this.rolesService.findAllWithCounts()
    return { roles: roles.map(({ role, usersCount }) => toRoleResponse(role, usersCount)) }
  }

  /**
   * The permission matrix, section by section, in the order the back-office
   * displays it. Only catalogued permissions are offered: legacy app-facing
   * rows (create:Order…) stay in the table but are not staff material.
   */
  @Get('permissions')
  async getCatalog() {
    const rows = await this.rolesService.getAllPermissions()
    const byKey = new Map(rows.map(p => [permissionKey(p.action, p.subject), p]))
    return {
      sections: ADMIN_PERMISSIONS_CATALOG.map(section => ({
        key: section.key,
        permissions: section.permissions.flatMap((perm) => {
          const row = byKey.get(permissionKey(perm.action, perm.subject))
          return row
            ? [{ id: row.id, key: perm.key, action: perm.action, subject: perm.subject, description: perm.description }]
            : []
        }),
      })),
    }
  }

  @Post()
  async create(@TypedBody(createRoleSchema) body: z.infer<typeof createRoleSchema>) {
    const role = await this.rolesService.create(body)
    return toRoleResponse(role, 0)
  }

  @Put(':id')
  async update(@Param('id') id: string, @TypedBody(updateRoleSchema) body: z.infer<typeof updateRoleSchema>) {
    const role = await this.rolesService.update(id, body)
    const usersCount = await this.rolesService.countUsers(role.id)
    return toRoleResponse(role, usersCount)
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.rolesService.delete(id)
    return { deleted: true }
  }

  @Post('assign')
  async assignRole(@TypedBody(assignRoleSchema) body: z.infer<typeof assignRoleSchema>) {
    await this.rolesService.assignRoleToUser(body.userId, body.roleId)
    return { assigned: true }
  }
}
