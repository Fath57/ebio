import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { CanRead, CanUpdate } from '../../common/decorators/check-permissions.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { buyerDecisionSchema, completeDeliverySchema } from './contracts/delivery.contract'
import { DeliveriesMapper } from './deliveries.mapper'
import { DeliveriesService } from './deliveries.service'

/**
 * The run on the courier's side: one offer, one decision.
 *
 * It cannot be accepted piecemeal (FR-015). The deliveries it holds keep their
 * own endpoints for pickup and handover — the status stays per order, which is
 * what leaves the supplier app untouched.
 */
@Controller('runs')
@UseGuards(AuthGuard)
export class RunsController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Get('offers')
  @UseGuards(CaslGuard)
  @CanRead('Delivery')
  async offers(@Session() session: LoggedInBetterAuthSession) {
    const rows = await this.deliveriesService.getRunOffers(session.user.id)
    return rows.map(DeliveriesMapper.toRunOffer)
  }

  /** The courier's current run, or nothing when they have none. */
  @Get('mine')
  @UseGuards(CaslGuard)
  @CanRead('Delivery')
  async mine(@Session() session: LoggedInBetterAuthSession) {
    const row = await this.deliveriesService.getMyActiveRun(session.user.id)
    return row === null ? null : DeliveriesMapper.toActiveRun(row)
  }

  @Post(':id/accept')
  @UseGuards(CaslGuard)
  @CanUpdate('Delivery')
  async accept(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const run = await this.deliveriesService.acceptRun(id, session.user.id)
    return { runId: run.id, pickupOrder: run.pickupOrder, shopCount: run.shopCount }
  }

  /**
   * The handover: one code, every order delivered, one settlement. The buyer
   * holds a single parcel and should not recite one code per shop.
   */
  @Post(':id/deliver')
  @UseGuards(CaslGuard)
  @CanUpdate('Delivery')
  async deliver(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(completeDeliverySchema) body: z.infer<typeof completeDeliverySchema>,
  ) {
    const run = await this.deliveriesService.deliverRun(id, session.user.id, body)
    return { runId: run.id, status: run.status, deliveredAt: run.deliveredAt?.toISOString() ?? null }
  }

  /**
   * The buyer decides when nobody takes their order: wait, or cancel and be
   * credited in full, fee included.
   */
  @Post(':id/buyer-decision')
  @UseGuards(CaslGuard)
  @CanUpdate('Order')
  async buyerDecision(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(buyerDecisionSchema) body: z.infer<typeof buyerDecisionSchema>,
  ) {
    return this.deliveriesService.buyerDecision(id, session.user.id, body.decision)
  }

  /** Targeted offer refused: the next ranked courier is asked right away. */
  @Post(':id/decline')
  @UseGuards(CaslGuard)
  @CanUpdate('Delivery')
  async decline(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    await this.deliveriesService.declineRun(id, session.user.id)
    return { declined: true }
  }
}
