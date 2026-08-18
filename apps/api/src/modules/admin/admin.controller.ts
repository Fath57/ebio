import type { Response } from 'express'
import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
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
import { Session } from '../auth/auth.decorator'
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
    @Session() session: LoggedInBetterAuthSession,
  ) {
    await this.adminService.validateSupplier(supplierId, body, session.user.id)
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
    @Session() session: LoggedInBetterAuthSession,
  ) {
    await this.adminService.resolveReport(id, body, session.user.id)
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
    @Session() session: LoggedInBetterAuthSession,
  ) {
    await this.adminService.resolveDispute(id, body, session.user.id)
    return { success: true }
  }

  @Patch('suppliers/:id/suspend')
  async suspendSupplier(
    @Param('id') id: string,
    @TypedBody(suspendSupplierSchema) body: SuspendSupplierInput,
    @Session() session: LoggedInBetterAuthSession,
  ) {
    await this.adminService.suspendSupplier(id, body.reason, session.user.id)
    return { success: true }
  }

  @Patch('suppliers/:id/reinstate')
  async reinstateSupplier(
    @Param('id') id: string,
    @Session() session: LoggedInBetterAuthSession,
  ) {
    await this.adminService.reinstateSupplier(id, session.user.id)
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

  @Get('orders')
  async getOrders(
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
    @Query('q') q?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.adminService.getOrders({
      status,
      supplierId,
      q,
      sortBy,
      sortDir,
      page: Number(page),
      limit: Number(limit),
    })
  }

  @Get('orders/:id')
  async getOrderById(@Param('id') id: string) {
    return this.adminService.getOrderById(id)
  }

  @Get('suppliers')
  async getSuppliers(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.adminService.getSuppliers({
      status,
      q,
      sortBy,
      sortDir,
      page: Number(page),
      limit: Number(limit),
    })
  }

  @Get('suppliers/:id')
  async getSupplierById(@Param('id') id: string) {
    return this.adminService.getSupplierById(id)
  }

  /**
   * Product lookup for the back office. The public search needs coordinates and
   * hides anything not on sale nearby, neither of which suits an editor
   * choosing what to feature.
   */
  @Get('products')
  async getProducts(
    @Query('q') q?: string,
    @Query('supplierId') supplierId?: string,
    @Query('limit') limit: string = '20',
  ) {
    return this.adminService.getProducts({ q, supplierId, limit: Number(limit) })
  }

  @Get('users')
  async getUsers(
    @Query('role') role?: string,
    @Query('q') q?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.adminService.getUsers({
      role,
      q,
      sortBy,
      sortDir,
      page: Number(page),
      limit: Number(limit),
    })
  }

  @Get('payments')
  async getPayments(
    @Query('status') status?: string,
    @Query('provider') provider?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('format') format: string = 'json',
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (format === 'csv') {
      const csv = await this.adminService.exportPaymentsCsv({ status, provider, q, from, to })
      res!.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res!.setHeader('Content-Disposition', 'attachment; filename=paiements.csv')
      return csv
    }

    return this.adminService.getPayments({
      status,
      provider,
      q,
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
