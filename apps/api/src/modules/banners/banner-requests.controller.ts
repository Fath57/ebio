import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { ApproveBannerRequest, CreateBannerRequest, RejectBannerRequest } from './contracts/banner.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { CanManage } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ActiveSupplierGuard } from '../../common/guards/active-supplier.guard'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { SuppliersService } from '../suppliers/suppliers.service'
import { BannerRequestStatus } from './banner-request.entity'
import { BannerRequestsService } from './banner-requests.service'
import { approveBannerRequestSchema, createBannerRequestSchema, rejectBannerRequestSchema } from './contracts/banner.contract'

@Controller('suppliers/me/banner-requests')
@UseGuards(AuthGuard, ActiveSupplierGuard)
export class SupplierBannerRequestsController {
  constructor(
    private readonly requests: BannerRequestsService,
    private readonly suppliers: SuppliersService,
  ) {}

  @Get()
  async list(@Session() session: LoggedInBetterAuthSession) {
    const supplier = await this.suppliers.findByUserId(session.user.id)
    return this.requests.listForSupplier(supplier.id)
  }

  @Post()
  async create(@Session() session: LoggedInBetterAuthSession, @TypedBody(createBannerRequestSchema) body: CreateBannerRequest) {
    const supplier = await this.suppliers.findByUserId(session.user.id)
    return this.requests.create(supplier.id, body)
  }

  @Post(':id/cancel')
  async cancel(@Session() session: LoggedInBetterAuthSession, @Param('id') id: string) {
    const supplier = await this.suppliers.findByUserId(session.user.id)
    return this.requests.cancel(supplier.id, id)
  }
}

@Controller('admin/banner-requests')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
@CanManage('Banner')
export class AdminBannerRequestsController {
  constructor(private readonly requests: BannerRequestsService) {}

  @Get()
  async list(@Query('status') status?: string) {
    const parsed = Object.values(BannerRequestStatus).includes(status as BannerRequestStatus) ? status as BannerRequestStatus : undefined
    return this.requests.listAll(parsed)
  }

  @Post(':id/approve')
  async approve(@Session() session: LoggedInBetterAuthSession, @Param('id') id: string, @TypedBody(approveBannerRequestSchema) body: ApproveBannerRequest) {
    return this.requests.approve(id, session.user.id, body)
  }

  @Post(':id/reject')
  async reject(@Session() session: LoggedInBetterAuthSession, @Param('id') id: string, @TypedBody(rejectBannerRequestSchema) body: RejectBannerRequest) {
    return this.requests.reject(id, session.user.id, body)
  }
}
