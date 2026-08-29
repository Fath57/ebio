import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import { TypedBody } from '@lonestone/nzoth/server'
import {
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { z } from 'zod'
import { CanCreate, CanRead, CanUpdate } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ActiveSupplierGuard } from '../../common/guards/active-supplier.guard'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { SuppliersService } from '../suppliers/suppliers.service'
import {
  createDisputeSchema,
  createOrderSchema,
  rejectOrderSchema,
  updateOrderStatusSchema,
} from './contracts/order.contract'
import { OrderStatus } from './entities/order.entity'
import { OrderMapper } from './orders.mapper'
import { OrdersService } from './orders.service'

@Controller('orders')
@UseGuards(AuthGuard, ActiveSupplierGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly suppliersService: SuppliersService,
  ) {}

  @Post()
  @UseGuards(CaslGuard)
  @CanCreate('Order')
  async create(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(createOrderSchema) body: z.infer<typeof createOrderSchema>,
  ) {
    const order = await this.ordersService.create(session.user.id, body)
    const loaded = await this.ordersService.findById(order.id)
    return OrderMapper.toResponse(loaded)
  }

  @Get()
  @UseGuards(CaslGuard)
  @CanRead('Order')
  async findAll(
    @Session() session: LoggedInBetterAuthSession,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('view') view?: string,
  ) {
    const filters = {
      status: status as OrderStatus | undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    }

    const userRole = (session.user as Record<string, unknown>).role as string | undefined

    if (userRole === 'SUPPLIER' && view !== 'buyer') {
      const supplier = await this.suppliersService.findByUserId(session.user.id)
      const result = await this.ordersService.findBySupplier(supplier.id, filters)
      const deliveries = await this.ordersService.deliverySummaries(result.orders.map(o => o.id))
      return {
        orders: result.orders.map(order => OrderMapper.toResponse(order, deliveries.get(order.id) ?? null)),
        total: result.total,
      }
    }

    const result = await this.ordersService.findByBuyer(session.user.id, filters)
    const deliveries = await this.ordersService.deliverySummaries(result.orders.map(o => o.id))
    return {
      orders: result.orders.map(order => OrderMapper.toResponse(order, deliveries.get(order.id) ?? null)),
      total: result.total,
    }
  }

  @Get(':id')
  @UseGuards(CaslGuard)
  @CanRead('Order')
  async findById(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const order = await this.ordersService.findById(id)
    const hasReview = await this.ordersService.hasReview(id)
    const deliveries = await this.ordersService.deliverySummaries([id])
    return { ...OrderMapper.toResponse(order, deliveries.get(id) ?? null), hasReview }
  }

  @Patch(':id/accept')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('Order')
  async accept(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    const order = await this.ordersService.accept(id, supplier.id)
    return OrderMapper.toResponse(order)
  }

  @Patch(':id/reject')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('Order')
  async reject(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(rejectOrderSchema) body: z.infer<typeof rejectOrderSchema>,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    const order = await this.ordersService.reject(id, supplier.id, body.reason)
    return OrderMapper.toResponse(order)
  }

  @Patch(':id/status')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('Order')
  async updateStatus(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(updateOrderStatusSchema) body: z.infer<typeof updateOrderStatusSchema>,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    const order = await this.ordersService.updateStatus(id, supplier.id, body.status as OrderStatus)
    return OrderMapper.toResponse(order)
  }

  @Patch(':id/confirm-delivery')
  @UseGuards(CaslGuard)
  @CanUpdate('Order')
  async confirmDelivery(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const order = await this.ordersService.confirmDelivery(id, session.user.id)
    return OrderMapper.toResponse(order)
  }

  /**
   * Verb alias: the mobile app shipped calling POST while the route was PATCH,
   * so the button never worked. Both verbs answer now, published builds included.
   */
  @Post(':id/confirm-delivery')
  @UseGuards(CaslGuard)
  @CanUpdate('Order')
  async confirmDeliveryPost(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const order = await this.ordersService.confirmDelivery(id, session.user.id)
    return OrderMapper.toResponse(order)
  }

  @Post(':id/dispute')
  @UseGuards(CaslGuard)
  @CanCreate('Order')
  async createDispute(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(createDisputeSchema) body: z.infer<typeof createDisputeSchema>,
  ) {
    const dispute = await this.ordersService.createDispute(id, session.user.id, body)
    return OrderMapper.toDisputeResponse(dispute)
  }
}
