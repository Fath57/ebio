import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { ValidationStatus } from '../suppliers/supplier.entity'
import { WalletService } from '../wallet/wallet.service'
import { AdminCouriersService } from './admin-couriers.service'
import { rejectCourierSchema } from './contracts/delivery.contract'
import { DeliveriesMapper } from './deliveries.mapper'
import { DeliveriesService } from './deliveries.service'
import { DeliveryStatus } from './entities/delivery.entity'

const VALID_STATUSES = new Set(Object.values(ValidationStatus))
const VALID_DELIVERY_STATUSES = new Set(Object.values(DeliveryStatus))

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
export class AdminCouriersController {
  constructor(
    private readonly adminCouriersService: AdminCouriersService,
    private readonly deliveriesService: DeliveriesService,
    private readonly walletService: WalletService,
  ) {}

  @Get('couriers')
  async list(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.adminCouriersService.list({
      status: status && VALID_STATUSES.has(status as ValidationStatus) ? status as ValidationStatus : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    })
    return {
      couriers: result.couriers.map(DeliveriesMapper.toCourierProfileResponse),
      total: result.total,
    }
  }

  @Get('couriers/:id')
  async getById(@Param('id') id: string) {
    const { profile, stats, identityDocument } = await this.adminCouriersService.getById(id)
    const wallet = await this.walletService.getOrCreate({ courierId: profile.id })
    return {
      ...DeliveriesMapper.toCourierProfileResponse(profile),
      stats,
      wallet: wallet ? { id: wallet.id, balance: Number(wallet.balance) } : null,
      identityDocumentUrl: identityDocument?.url ?? null,
      identityDocumentMimeType: identityDocument?.mimeType ?? null,
      identityDocumentName: identityDocument?.originalName ?? null,
    }
  }

  @Post('couriers/:id/approve')
  async approve(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const profile = await this.adminCouriersService.approve(id, session.user.id)
    return DeliveriesMapper.toCourierProfileResponse(profile)
  }

  @Post('couriers/:id/reject')
  async reject(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(rejectCourierSchema) body: z.infer<typeof rejectCourierSchema>,
  ) {
    const profile = await this.adminCouriersService.reject(id, session.user.id, body.reason)
    return DeliveriesMapper.toCourierProfileResponse(profile)
  }

  @Post('couriers/:id/suspend')
  async suspend(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const profile = await this.adminCouriersService.suspend(id, session.user.id)
    return DeliveriesMapper.toCourierProfileResponse(profile)
  }

  @Post('couriers/:id/reactivate')
  async reactivate(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const profile = await this.adminCouriersService.reactivate(id, session.user.id)
    return DeliveriesMapper.toCourierProfileResponse(profile)
  }

  @Get('deliveries')
  async listDeliveries(
    @Query('status') status?: string,
    @Query('courierId') courierId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.adminCouriersService.listDeliveries({
      status: status && VALID_DELIVERY_STATUSES.has(status as DeliveryStatus) ? status as DeliveryStatus : undefined,
      courierId,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    })
    const deliveries = []
    for (const delivery of result.deliveries) {
      const events = await this.deliveriesService.getEvents(delivery.id)
      deliveries.push(DeliveriesMapper.toResponse(delivery, 'admin', events))
    }
    return { deliveries, total: result.total }
  }
}
