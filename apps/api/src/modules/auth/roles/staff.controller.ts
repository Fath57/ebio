import type { LoggedInBetterAuthSession } from '../../../config/better-auth.config'
import type { StaffMember } from './staff.service'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { CanManage } from '../../../common/decorators/check-permissions.decorator'
import { Roles } from '../../../common/decorators/roles.decorator'
import { CaslGuard } from '../../../common/guards/casl.guard'
import { RolesGuard } from '../../../common/guards/roles.guard'
import { Session } from '../auth.decorator'
import { User } from '../auth.entity'
import { AuthGuard } from '../auth.guard'
import { StaffService } from './staff.service'

const inviteStaffSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  roleId: z.string().uuid(),
}).meta({ title: 'InviteStaff', description: 'Add a member to the back-office team' })

const changeStaffRoleSchema = z.object({
  roleId: z.string().uuid(),
}).meta({ title: 'ChangeStaffRole' })

function toResponse(member: StaffMember) {
  return {
    ...member,
    lastLoginAt: member.lastLoginAt?.toISOString() ?? null,
    createdAt: member.createdAt.toISOString(),
  }
}

@Controller('admin/staff')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
@CanManage('Staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  async list() {
    const members = await this.staffService.list()
    return { members: members.map(toResponse) }
  }

  @Post()
  async invite(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(inviteStaffSchema) body: z.infer<typeof inviteStaffSchema>,
  ) {
    const member = await this.staffService.invite(body, session.user as unknown as User)
    return toResponse(member)
  }

  @Post(':id/resend-invitation')
  async resendInvitation(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    await this.staffService.resendInvitation(id, session.user as unknown as User)
    return { sent: true }
  }

  @Patch(':id/role')
  async changeRole(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(changeStaffRoleSchema) body: z.infer<typeof changeStaffRoleSchema>,
  ) {
    const member = await this.staffService.changeRole(id, body.roleId, session.user as unknown as User)
    return toResponse(member)
  }

  @Delete(':id')
  async remove(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    await this.staffService.remove(id, session.user as unknown as User)
    return { removed: true }
  }
}
