import type { Response } from 'express'
import type { JwtAuthenticatedRequest } from '../../common/guards/jwt-auth.guard'
import type {
  BroadcastNotification,
  CommissionRates,
  DisputeResolutionInput,
  ResolveReportInput,
  SuspendSupplierInput,
  ValidationActionInput,
} from './contracts/admin.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import {
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common'
import { CanManage } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { AuthGuard } from '../auth/auth.guard'
import { AdminService } from './admin.service'
import {
  broadcastNotificationSchema,
  commissionRateSchema,
  disputeResolutionSchema,
  resolveReportSchema,
  suspendSupplierSchema,
  validationActionSchema,
} from './contracts/admin.contract'

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
@CanManage('all')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  async getDashboard() {
    return this.adminService.getDashboardKpis()
  }

  @Get('validations')
  async getValidations(
    @Query('status') status?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.adminService.getValidationQueue({
      status,
      page: Number(page),
      limit: Number(limit),
    })
  }

  @Patch('validations/:supplierId')
  async validateSupplier(
    @Param('supplierId') supplierId: string,
    @TypedBody(validationActionSchema) body: ValidationActionInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const req = res.req as unknown as JwtAuthenticatedRequest
    await this.adminService.validateSupplier(supplierId, body, req.user.sub)
    return { success: true }
  }

  @Get('reports')
  async getReports(
    @Query('targetType') targetType?: string,
    @Query('status') status?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.adminService.getReports({
      targetType,
      status,
      page: Number(page),
      limit: Number(limit),
    })
  }

  @Patch('reports/:id')
  async resolveReport(
    @Param('id') id: string,
    @TypedBody(resolveReportSchema) body: ResolveReportInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const req = res.req as unknown as JwtAuthenticatedRequest
    await this.adminService.resolveReport(id, body, req.user.sub)
    return { success: true }
  }

  @Get('disputes')
  async getDisputes(
    @Query('status') status?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.adminService.getDisputes({
      status,
      page: Number(page),
      limit: Number(limit),
    })
  }

  @Patch('disputes/:id')
  async resolveDispute(
    @Param('id') id: string,
    @TypedBody(disputeResolutionSchema) body: DisputeResolutionInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const req = res.req as unknown as JwtAuthenticatedRequest
    await this.adminService.resolveDispute(id, body, req.user.sub)
    return { success: true }
  }

  @Patch('suppliers/:id/suspend')
  async suspendSupplier(
    @Param('id') id: string,
    @TypedBody(suspendSupplierSchema) body: SuspendSupplierInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const req = res.req as unknown as JwtAuthenticatedRequest
    await this.adminService.suspendSupplier(id, body.reason, req.user.sub)
    return { success: true }
  }

  @Get('transactions')
  async getTransactions(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('format') format: string = 'json',
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (format === 'csv') {
      const csv = await this.adminService.exportTransactionsCsv(from, to)
      res!.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res!.setHeader('Content-Disposition', 'attachment; filename=transactions.csv')
      return csv
    }

    return this.adminService.getTransactions({
      from,
      to,
      page: Number(page),
      limit: Number(limit),
    })
  }

  @Get('settings')
  async getSettings() {
    return this.adminService.getSettings()
  }

  @Put('settings/commissions')
  async updateCommissions(
    @TypedBody(commissionRateSchema) body: CommissionRates,
  ) {
    await this.adminService.updateCommissionRates(body)
    return { success: true }
  }

  @Post('notifications/broadcast')
  async broadcastNotification(
    @TypedBody(broadcastNotificationSchema) body: BroadcastNotification,
  ) {
    return this.adminService.broadcastNotification(body)
  }
}
