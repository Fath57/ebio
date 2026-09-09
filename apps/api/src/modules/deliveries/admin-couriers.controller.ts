import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { CanManage, CanRead } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { ValidationStatus } from '../suppliers/supplier.entity'
import { WalletService } from '../wallet/wallet.service'
import { AdminCouriersService } from './admin-couriers.service'
import { AdminDeliveriesService } from './admin-deliveries.service'
import { assignDeliverySchema, rejectCourierSchema } from './contracts/delivery.contract'
import { DeliveriesMapper } from './deliveries.mapper'
import { DeliveriesService } from './deliveries.service'
import { VehicleType } from './entities/courier-profile.entity'
import { DeliveryStatus } from './entities/delivery.entity'

const VALID_STATUSES = new Set(Object.values(ValidationStatus))
const VALID_DELIVERY_STATUSES = new Set(Object.values(DeliveryStatus))
const VALID_VEHICLE_TYPES = new Set(Object.values(VehicleType))

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
export class AdminCouriersController {
  constructor(
    private readonly adminCouriersService: AdminCouriersService,
    private readonly adminDeliveriesService: AdminDeliveriesService,
    private readonly deliveriesService: DeliveriesService,
    private readonly walletService: WalletService,
  ) {}

  @CanRead('CourierProfile')
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

  @CanRead('CourierProfile')
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

  @CanManage('CourierProfile')
  @Post('couriers/:id/approve')
  async approve(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const profile = await this.adminCouriersService.approve(id, session.user.id)
    return DeliveriesMapper.toCourierProfileResponse(profile)
  }

  @CanManage('CourierProfile')
  @Post('couriers/:id/reject')
  async reject(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(rejectCourierSchema) body: z.infer<typeof rejectCourierSchema>,
  ) {
    const profile = await this.adminCouriersService.reject(id, session.user.id, body.reason)
    return DeliveriesMapper.toCourierProfileResponse(profile)
  }

  @CanManage('CourierProfile')
  @Post('couriers/:id/suspend')
  async suspend(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const profile = await this.adminCouriersService.suspend(id, session.user.id)
    return DeliveriesMapper.toCourierProfileResponse(profile)
  }

  @CanManage('CourierProfile')
  @Post('couriers/:id/reactivate')
  async reactivate(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const profile = await this.adminCouriersService.reactivate(id, session.user.id)
    return DeliveriesMapper.toCourierProfileResponse(profile)
  }

  @CanRead('Delivery')
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

  @CanRead('Delivery')
  @Get('deliveries/:id')
  async getDelivery(@Param('id') id: string) {
    const delivery = await this.adminDeliveriesService.getById(id)
    const events = await this.deliveriesService.getEvents(delivery.id)
    return {
      ...DeliveriesMapper.toResponse(delivery, 'admin', events),
      courierId: delivery.courier?.id ?? null,
      reassignmentCount: delivery.reassignmentCount,
      offeredAt: delivery.offeredAt.toISOString(),
    }
  }

  /** Couriers ranked around the pickup point, for the assignment page. */
  @CanRead('Delivery')
  @Get('deliveries/:id/candidates')
  async listCandidates(
    @Param('id') id: string,
    @Query('q') q?: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('availableOnly') availableOnly?: string,
    @Query('vehicleType') vehicleType?: string,
  ) {
    const radius = radiusKm ? Number(radiusKm) : undefined
    return this.adminDeliveriesService.findCandidates(id, {
      q,
      radiusKm: radius !== undefined && !Number.isNaN(radius) ? radius : undefined,
      availableOnly: availableOnly === 'true',
      vehicleType: vehicleType && VALID_VEHICLE_TYPES.has(vehicleType as VehicleType) ? vehicleType : undefined,
    })
  }

  @CanManage('Delivery')
  @Post('deliveries/:id/assign')
  async assignDelivery(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(assignDeliverySchema) body: z.infer<typeof assignDeliverySchema>,
  ) {
    const delivery = await this.adminDeliveriesService.assign(id, body.courierId, session.user.id, body.note)
    const events = await this.deliveriesService.getEvents(delivery.id)
    return DeliveriesMapper.toResponse(delivery, 'admin', events)
  }

  @CanManage('Delivery')
  @Post('deliveries/:id/rebroadcast')
  async rebroadcastDelivery(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const delivery = await this.adminDeliveriesService.rebroadcast(id, session.user.id)
    const events = await this.deliveriesService.getEvents(delivery.id)
    return DeliveriesMapper.toResponse(delivery, 'admin', events)
  }
}
