import type { Response } from 'express'
import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { OrderStatus } from '../orders/entities/order.entity'
import type {
  AdminOrderDeliveryWindowInput,
  AdminOrderStatusInput,
  BroadcastNotification,
  CashOnDeliveryLimitInput,
  CommissionRates,
  CourierDebtLimitInput,
  CourierOfferTimeoutInput,
  CourierPickupPolicyInput,
  DeliveryCommissionRateInput,
  DisputeResolutionInput,
  ResolveReportInput,
  SupplierCommissionRateInput,
  SupplierDebtLimitInput,
  SupplierEscrowReleaseInput,
  SuspendSupplierInput,
  ValidationActionInput,
} from './contracts/admin.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common'
import { CanManage, CanRead } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { OrdersService } from '../orders/orders.service'
import { AdminDashboardService, parseDashboardPeriod } from './admin-dashboard.service'
import { AdminPaymentDetailService } from './admin-payment-detail.service'
import { AdminProductDetailService } from './admin-product-detail.service'
import { AdminService } from './admin.service'
import { AuditService } from './audit.service'
import {
  adminOrderDeliveryWindowSchema,
  adminOrderStatusSchema,
  broadcastNotificationSchema,
  cashOnDeliveryLimitSchema,
  commissionRateSchema,
  courierDebtLimitSchema,
  courierOfferTimeoutSchema,
  courierPickupPolicySchema,
  deliveryCommissionSchema,
  disputeResolutionSchema,
  resolveReportSchema,
  supplierCommissionRateSchema,
  supplierDebtLimitSchema,
  supplierEscrowReleaseSchema,
  suspendSupplierSchema,
  validationActionSchema,
} from './contracts/admin.contract'
import { readOrderFilters } from './order-filters'
import { readDay, readMinimum } from './supplier-filters'

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly dashboardService: AdminDashboardService,
    private readonly paymentDetailService: AdminPaymentDetailService,
    private readonly productDetailService: AdminProductDetailService,
    private readonly ordersService: OrdersService,
    private readonly auditService: AuditService,
  ) {}

  /** Back-office home: the period's figures against the period before, a daily series, the top shops. */
  @Get('dashboard')
  async getDashboard(@Query('period') period?: string) {
    return this.dashboardService.getOverview(parseDashboardPeriod(period))
  }

  @CanRead('Supplier')
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

  @CanManage('Supplier')
  @Patch('validations/:supplierId')
  async validateSupplier(
    @Param('supplierId') supplierId: string,
    @TypedBody(validationActionSchema) body: ValidationActionInput,
    @Session() session: LoggedInBetterAuthSession,
  ) {
    await this.adminService.validateSupplier(supplierId, body, session.user.id)
    return { success: true }
  }

  @CanManage('ContentReport')
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

  @CanManage('ContentReport')
  @Patch('reports/:id')
  async resolveReport(
    @Param('id') id: string,
    @TypedBody(resolveReportSchema) body: ResolveReportInput,
    @Session() session: LoggedInBetterAuthSession,
  ) {
    await this.adminService.resolveReport(id, body, session.user.id)
    return { success: true }
  }

  @CanRead('Order')
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

  @CanManage('Order')
  @Patch('disputes/:id')
  async resolveDispute(
    @Param('id') id: string,
    @TypedBody(disputeResolutionSchema) body: DisputeResolutionInput,
    @Session() session: LoggedInBetterAuthSession,
  ) {
    await this.adminService.resolveDispute(id, body, session.user.id)
    return { success: true }
  }

  @CanManage('Supplier')
  @Patch('suppliers/:id/suspend')
  async suspendSupplier(
    @Param('id') id: string,
    @TypedBody(suspendSupplierSchema) body: SuspendSupplierInput,
    @Session() session: LoggedInBetterAuthSession,
  ) {
    await this.adminService.suspendSupplier(id, body.reason, session.user.id)
    return { success: true }
  }

  /** Negotiated rate (fraction); null goes back to the category grid. */
  @CanManage('Supplier')
  @Patch('suppliers/:id/commission-rate')
  async updateSupplierCommissionRate(
    @Param('id') id: string,
    @TypedBody(supplierCommissionRateSchema) body: SupplierCommissionRateInput,
  ) {
    await this.adminService.updateSupplierCommissionRate(id, body.rate)
    return { success: true }
  }

  /** The shop's own payment delay in hours (0 = at delivery); null follows the platform. */
  @CanManage('Supplier')
  @Patch('suppliers/:id/escrow-release')
  async updateSupplierEscrowRelease(
    @Param('id') id: string,
    @TypedBody(supplierEscrowReleaseSchema) body: SupplierEscrowReleaseInput,
  ) {
    await this.adminService.updateSupplierEscrowRelease(id, body.hours)
    return { success: true }
  }

  @CanManage('Supplier')
  @Patch('suppliers/:id/reinstate')
  async reinstateSupplier(
    @Param('id') id: string,
    @Session() session: LoggedInBetterAuthSession,
  ) {
    await this.adminService.reinstateSupplier(id, session.user.id)
    return { success: true }
  }

  @CanRead('Payment')
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

  @CanRead('Payment')
  @Get('commissions')
  async getCommissions(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('supplierId') supplierId?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.adminService.getCommissions({
      from,
      to,
      supplierId,
      page: Number(page),
      limit: Number(limit),
    })
  }

  @CanRead('Payment')
  @Get('commissions/orders')
  async getCommissionOrders(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('supplierId') supplierId?: string,
    @Query('format') format: string = 'json',
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (format === 'csv') {
      const csv = await this.adminService.exportCommissionsCsv({ from, to, supplierId })
      res!.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res!.setHeader('Content-Disposition', 'attachment; filename=commissions.csv')
      return csv
    }

    return this.adminService.getCommissionOrders({
      from,
      to,
      supplierId,
      page: Number(page),
      limit: Number(limit),
    })
  }

  @CanRead('Order')
  @Get('orders')
  async getOrders(
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
    @Query('q') q?: string,
    @Query('paymentMethod') paymentMethod?: string,
    @Query('pickupMode') pickupMode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('minAmount') minAmount?: string,
    @Query('maxAmount') maxAmount?: string,
    @Query('promo') promo?: string,
    @Query('sponsor') sponsor?: string,
    @Query('courier') courier?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('format') format: string = 'json',
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Res({ passthrough: true }) res?: Response,
  ) {
    const filters = readOrderFilters({ supplierId, paymentMethod, pickupMode, from, to, minAmount, maxAmount, promo, sponsor, courier })

    if (format === 'csv') {
      const csv = await this.adminService.exportOrdersCsv({ status: status || undefined, q: q || undefined, filters, sortBy, sortDir })
      res!.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res!.setHeader('Content-Disposition', 'attachment; filename=commandes.csv')
      return csv
    }

    return this.adminService.getOrders({
      status,
      q,
      filters,
      sortBy,
      sortDir,
      page: Number(page),
      limit: Number(limit),
    })
  }

  @CanRead('Order')
  @Get('orders/:id')
  async getOrderById(@Param('id') id: string) {
    return this.adminService.getOrderById(id)
  }

  /** Admins can set any status: their job is unblocking real-world messes. */
  @CanManage('Order')
  @Patch('orders/:id/status')
  async updateOrderStatus(
    @Param('id') id: string,
    @TypedBody(adminOrderStatusSchema) body: AdminOrderStatusInput,
  ) {
    await this.ordersService.adminUpdateStatus(id, body.status as OrderStatus)
    return { success: true }
  }

  /** Admin or support sets the delivery window; a unified cart moves as one. */
  @CanManage('Order')
  @Patch('orders/:id/delivery-window')
  async updateOrderDeliveryWindow(
    @Param('id') id: string,
    @TypedBody(adminOrderDeliveryWindowSchema) body: AdminOrderDeliveryWindowInput,
    @Session() session: LoggedInBetterAuthSession,
  ) {
    const orders = await this.ordersService.adminUpdateDeliveryWindow(id, body, session.user.id)
    await Promise.all(orders.map(order => this.auditService.record({
      actorUserId: session.user.id,
      action: 'ORDER_DELIVERY_WINDOW_CHANGED',
      targetType: 'order',
      targetId: order.id,
      reason: body.reason,
      payload: { orderNumber: order.orderNumber, start: body.start, end: body.end, slot: order.deliverySlot ?? null },
    })))
    return { success: true }
  }

  @CanRead('Supplier')
  @Get('suppliers')
  async getSuppliers(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('mode') mode?: string,
    @Query('minOrders') minOrders?: string,
    @Query('minBalance') minBalance?: string,
    @Query('minProducts') minProducts?: string,
    @Query('minRating') minRating?: string,
    @Query('inactiveDays') inactiveDays?: string,
    @Query('located') located?: string,
    @Query('negotiatedRate') negotiatedRate?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.adminService.getSuppliers({
      status,
      q,
      type: type || undefined,
      mode: mode || undefined,
      minOrders: readMinimum(minOrders),
      minBalance: readMinimum(minBalance),
      minProducts: readMinimum(minProducts),
      minRating: readMinimum(minRating),
      inactiveDays: readMinimum(inactiveDays),
      located: located === 'yes' || located === 'no' ? located : undefined,
      negotiatedRate: negotiatedRate === 'yes' || negotiatedRate === 'no' ? negotiatedRate : undefined,
      createdFrom: readDay(createdFrom),
      createdTo: readDay(createdTo, true),
      sortBy,
      sortDir,
      page: Number(page),
      limit: Number(limit),
    })
  }

  @CanRead('Supplier')
  @Get('suppliers/:id')
  async getSupplierById(@Param('id') id: string) {
    return this.adminService.getSupplierById(id)
  }

  /**
   * Product lookup for the back office. The public search needs coordinates and
   * hides anything not on sale nearby, neither of which suits an editor
   * choosing what to feature.
   */
  @CanRead('Product')
  @Get('products')
  async getProducts(
    @Query('q') q?: string,
    @Query('supplierId') supplierId?: string,
    @Query('limit') limit: string = '20',
  ) {
    return this.adminService.getProducts({ q, supplierId, limit: Number(limit) })
  }

  /**
   * Every product of every shop, browsable.
   *
   * Separate from `products` above, which caps at fifty and only ever shows
   * what is on sale: a picker and a catalogue are not the same screen, and
   * making one serve both would quietly hide withdrawn products from whoever
   * came looking for exactly those.
   */
  @CanRead('Product')
  @Get('catalogue')
  async getCatalogue(
    @Query('q') q?: string,
    @Query('supplierId') supplierId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('status') status?: string,
    @Query('moderation') moderation?: string,
    @Query('stock') stock?: string,
    @Query('promo') promo?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('minSold') minSold?: string,
    @Query('sales') sales?: string,
    @Query('label') label?: string,
    @Query('photo') photo?: string,
    @Query('shop') shop?: string,
    @Query('formats') formats?: string,
    @Query('minRating') minRating?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '25',
  ) {
    return this.adminService.getCatalogue({
      q,
      supplierId,
      categoryId,
      status,
      moderation,
      stock,
      promo: promo === 'true',
      minPrice: readMinimum(minPrice),
      maxPrice: readMinimum(maxPrice),
      minSold: readMinimum(minSold),
      sales: sales === 'none' || sales === 'some' ? sales : undefined,
      label: label && /^[a-z0-9-]{2,64}$/.test(label) ? label : undefined,
      photo: photo === 'missing' ? 'missing' : undefined,
      shop: shop === 'validated' || shop === 'not_validated' ? shop : undefined,
      formats: formats === 'formats' || formats === 'packs' ? formats : undefined,
      minRating: readMinimum(minRating),
      createdFrom: readDay(createdFrom),
      createdTo: readDay(createdTo, true),
      sortBy,
      sortDir,
      page: Number(page),
      limit: Number(limit),
    })
  }

  /** A product as staff see it: its page, its sales, its latest orders and reviews, why it may be invisible. */
  @CanRead('Product')
  @Get('catalogue/:id')
  async getCatalogueProduct(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.productDetailService.getDetail(id)
  }

  @CanRead('User')
  @Get('users')
  async getUsers(
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.adminService.getUsers({
      role,
      status,
      q,
      sortBy,
      sortDir,
      page: Number(page),
      limit: Number(limit),
    })
  }

  /** One payment, its order and cart, the provider's journal and the wallet movements it caused. */
  @CanRead('Payment')
  @Get('payments/:id')
  async getPaymentDetail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.paymentDetailService.getDetail(id)
  }

  @CanRead('Payment')
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

  @CanRead('Settings')
  @Get('settings')
  async getSettings() {
    return this.adminService.getSettings()
  }

  @CanManage('Settings')
  @Put('settings/commissions')
  async updateCommissions(
    @TypedBody(commissionRateSchema) body: CommissionRates,
  ) {
    await this.adminService.updateCommissionRates(body)
    return { success: true }
  }

  @CanManage('Settings')
  @Put('settings/delivery-commission')
  async updateDeliveryCommission(
    @TypedBody(deliveryCommissionSchema) body: DeliveryCommissionRateInput,
  ) {
    await this.adminService.updateDeliveryCommissionRate(body.rate)
    return { success: true }
  }

  @CanManage('Settings')
  @Put('settings/cash-limit')
  async updateCashOnDeliveryLimit(
    @TypedBody(cashOnDeliveryLimitSchema) body: CashOnDeliveryLimitInput,
  ) {
    await this.adminService.updateCashOnDeliveryMaxAmount(body.amount)
    return { success: true }
  }

  @CanManage('Settings')
  @Put('settings/courier-debt-limit')
  async updateCourierDebtLimit(
    @TypedBody(courierDebtLimitSchema) body: CourierDebtLimitInput,
  ) {
    await this.adminService.updateCourierMaxDebt(body.amount)
    return { success: true }
  }

  @CanManage('Settings')
  @Put('settings/supplier-debt-limit')
  async updateSupplierDebtLimit(
    @TypedBody(supplierDebtLimitSchema) body: SupplierDebtLimitInput,
  ) {
    await this.adminService.updateSupplierMaxDebt(body.amount)
    return { success: true }
  }

  @CanManage('Settings')
  @Put('settings/courier-offer-timeout')
  async updateCourierOfferTimeout(
    @TypedBody(courierOfferTimeoutSchema) body: CourierOfferTimeoutInput,
  ) {
    await this.adminService.updateCourierOfferTimeout(body.seconds)
    return { success: true }
  }

  @CanManage('Settings')
  @Put('settings/courier-pickup-policy')
  async updateCourierPickupPolicy(
    @TypedBody(courierPickupPolicySchema) body: CourierPickupPolicyInput,
  ) {
    await this.adminService.updateCourierPickupPolicy(body)
    return { success: true }
  }

  @CanManage('Notification')
  @Post('notifications/broadcast')
  async broadcastNotification(
    @TypedBody(broadcastNotificationSchema) body: BroadcastNotification,
  ) {
    return this.adminService.broadcastNotification(body)
  }
}
