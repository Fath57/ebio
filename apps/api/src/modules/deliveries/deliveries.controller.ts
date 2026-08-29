import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { CanRead, CanUpdate } from '../../common/decorators/check-permissions.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import {
  completeDeliverySchema,
  failDeliverySchema,
  transitionSchema,
} from './contracts/delivery.contract'
import { DeliveriesMapper } from './deliveries.mapper'
import { DeliveriesService } from './deliveries.service'

@Controller('deliveries')
@UseGuards(AuthGuard)
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Get('offers')
  @UseGuards(CaslGuard)
  @CanRead('Delivery')
  async offers(@Session() session: LoggedInBetterAuthSession) {
    const rows = await this.deliveriesService.getOffers(session.user.id)
    return rows.map(DeliveriesMapper.toOffer)
  }

  @Get('mine')
  @UseGuards(CaslGuard)
  @CanRead('Delivery')
  async mine(
    @Session() session: LoggedInBetterAuthSession,
    @Query('status') status?: string,
  ) {
    const filter = status === 'active' || status === 'done' ? status : undefined
    const deliveries = await this.deliveriesService.getMine(session.user.id, filter)
    const responses = []
    for (const delivery of deliveries) {
      const events = await this.deliveriesService.getEvents(delivery.id)
      responses.push(DeliveriesMapper.toResponse(delivery, 'courier', events))
    }
    return responses
  }

  @Get('by-order/:orderId')
  @UseGuards(CaslGuard)
  @CanRead('Delivery')
  async byOrder(
    @Session() session: LoggedInBetterAuthSession,
    @Param('orderId') orderId: string,
  ) {
    const { delivery, audience } = await this.deliveriesService.getByOrderForRequester(orderId, session.user.id)
    const events = await this.deliveriesService.getEvents(delivery.id)
    return DeliveriesMapper.toResponse(delivery, audience, events)
  }

  @Get(':id')
  @UseGuards(CaslGuard)
  @CanRead('Delivery')
  async byId(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const { delivery, audience } = await this.deliveriesService.getForRequester(id, session.user.id)
    const events = await this.deliveriesService.getEvents(delivery.id)
    return DeliveriesMapper.toResponse(delivery, audience, events)
  }

  @Post(':id/accept')
  @UseGuards(CaslGuard)
  @CanUpdate('Delivery')
  async accept(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const delivery = await this.deliveriesService.accept(id, session.user.id)
    const events = await this.deliveriesService.getEvents(delivery.id)
    return DeliveriesMapper.toResponse(delivery, 'courier', events)
  }

  @Post(':id/pickup')
  @UseGuards(CaslGuard)
  @CanUpdate('Delivery')
  async pickup(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(transitionSchema) body: z.infer<typeof transitionSchema>,
  ) {
    const delivery = await this.deliveriesService.pickup(id, session.user.id, body.occurredAt)
    const events = await this.deliveriesService.getEvents(delivery.id)
    return DeliveriesMapper.toResponse(delivery, 'courier', events)
  }

  @Post(':id/start')
  @UseGuards(CaslGuard)
  @CanUpdate('Delivery')
  async start(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(transitionSchema) body: z.infer<typeof transitionSchema>,
  ) {
    const delivery = await this.deliveriesService.start(id, session.user.id, body.occurredAt)
    const events = await this.deliveriesService.getEvents(delivery.id)
    return DeliveriesMapper.toResponse(delivery, 'courier', events)
  }

  @Post(':id/complete')
  @UseGuards(CaslGuard)
  @CanUpdate('Delivery')
  async complete(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(completeDeliverySchema) body: z.infer<typeof completeDeliverySchema>,
  ) {
    const delivery = await this.deliveriesService.complete(id, session.user.id, body)
    const events = await this.deliveriesService.getEvents(delivery.id)
    return DeliveriesMapper.toResponse(delivery, 'courier', events)
  }

  @Post(':id/fail')
  @UseGuards(CaslGuard)
  @CanUpdate('Delivery')
  async fail(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(failDeliverySchema) body: z.infer<typeof failDeliverySchema>,
  ) {
    const delivery = await this.deliveriesService.fail(id, session.user.id, body)
    const events = await this.deliveriesService.getEvents(delivery.id)
    return DeliveriesMapper.toResponse(delivery, 'courier', events)
  }

  @Post(':id/rebroadcast')
  @UseGuards(CaslGuard)
  @CanUpdate('Delivery')
  async rebroadcast(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const delivery = await this.deliveriesService.rebroadcast(id, session.user.id)
    const events = await this.deliveriesService.getEvents(delivery.id)
    return DeliveriesMapper.toResponse(delivery, 'supplier', events)
  }
}
