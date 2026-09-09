import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { AdminUserDetail } from './admin-users.service'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { CanManage, CanRead } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Session } from '../auth/auth.decorator'
import { User } from '../auth/auth.entity'
import { AuthGuard } from '../auth/auth.guard'
import { AdminUsersService } from './admin-users.service'
import { AuditService } from './audit.service'

const suspendUserSchema = z.object({
  reason: z.string().trim().min(3).max(255),
  /** Absent = until an admin reinstates the account. */
  until: z.string().datetime().optional(),
}).meta({ title: 'SuspendUser', description: 'Temporarily block an account' })

const banUserSchema = z.object({
  reason: z.string().trim().min(3).max(255),
}).meta({ title: 'BanUser', description: 'Permanently block an account' })

const reinstateUserSchema = z.object({
  note: z.string().trim().max(255).optional(),
}).meta({ title: 'ReinstateUser' })

function toResponse(detail: AdminUserDetail) {
  return {
    ...detail,
    suspendedUntil: detail.suspendedUntil?.toISOString() ?? null,
    statusChangedAt: detail.statusChangedAt?.toISOString() ?? null,
    lastLoginAt: detail.lastLoginAt?.toISOString() ?? null,
    createdAt: detail.createdAt.toISOString(),
    history: detail.history.map(h => ({ ...h, createdAt: h.createdAt.toISOString() })),
  }
}

@Controller('admin/users')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
export class AdminUsersController {
  constructor(
    private readonly adminUsersService: AdminUsersService,
    private readonly auditService: AuditService,
  ) {}

  @CanRead('User')
  @Get(':id')
  async getById(@Param('id') id: string) {
    return toResponse(await this.adminUsersService.getDetail(id))
  }

  @CanManage('User')
  @Patch(':id/suspend')
  async suspend(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(suspendUserSchema) body: z.infer<typeof suspendUserSchema>,
  ) {
    const detail = await this.adminUsersService.suspend(
      id,
      session.user as unknown as User,
      body.reason,
      body.until ? new Date(body.until) : undefined,
    )
    return toResponse(detail)
  }

  @CanManage('User')
  @Patch(':id/ban')
  async ban(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(banUserSchema) body: z.infer<typeof banUserSchema>,
  ) {
    return toResponse(await this.adminUsersService.ban(id, session.user as unknown as User, body.reason))
  }

  @CanManage('User')
  @Patch(':id/reinstate')
  async reinstate(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(reinstateUserSchema) body: z.infer<typeof reinstateUserSchema>,
  ) {
    return toResponse(await this.adminUsersService.reinstate(id, session.user as unknown as User, body.note))
  }

  /** Staff activity, newest first: what a member did, or everything recent. */
  @CanManage('Staff')
  @Get('audit/recent')
  async recentAudit(@Query('actorId') actorId?: string) {
    const rows = actorId
      ? await this.auditService.listByActor(actorId)
      : await this.auditService.listRecent()
    return { entries: rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })) }
  }
}
