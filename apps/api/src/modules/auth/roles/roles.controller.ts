import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { CanManage } from '../../../common/decorators/check-permissions.decorator'
import { CaslGuard } from '../../../common/guards/casl.guard'
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard'
import { RolesService } from './roles.service'

const createRoleSchema = z.object({
  name: z.string().min(2).max(50),
  description: z.string().max(200).optional(),
  permissionIds: z.array(z.string().uuid()).optional(),
}).meta({ title: 'CreateRole' })

const updateRoleSchema = createRoleSchema.partial().meta({ title: 'UpdateRole' })

const assignRoleSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
}).meta({ title: 'AssignRole' })

@Controller('admin/roles')
@UseGuards(JwtAuthGuard, CaslGuard)
@CanManage('all')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  async findAll() {
    const roles = await this.rolesService.findAll()
    return {
      roles: roles.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isDefault: r.isDefault,
        permissions: r.permissions.getItems().map(p => ({
          id: p.id,
          action: p.action,
          subject: p.subject,
          description: p.description,
        })),
      })),
    }
  }

  @Get('permissions')
  async getAllPermissions() {
    const permissions = await this.rolesService.getAllPermissions()
    return {
      permissions: permissions.map(p => ({
        id: p.id,
        action: p.action,
        subject: p.subject,
        description: p.description,
      })),
    }
  }

  @Post()
  async create(@TypedBody(createRoleSchema) body: z.infer<typeof createRoleSchema>) {
    return this.rolesService.create(body)
  }

  @Put(':id')
  async update(@Param('id') id: string, @TypedBody(updateRoleSchema) body: z.infer<typeof updateRoleSchema>) {
    return this.rolesService.update(id, body)
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
