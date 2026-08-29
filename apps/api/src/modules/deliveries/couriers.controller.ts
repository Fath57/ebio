import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Get, Patch, Post, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import {
  registerCourierSchema,
  updateAvailabilitySchema,
  updateCourierSchema,
  updateLocationSchema,
} from './contracts/delivery.contract'
import { DeliveriesMapper } from './deliveries.mapper'
import { DeliveriesService } from './deliveries.service'

/**
 * Self-scoped courier profile routes: every handler acts on the caller's own
 * profile, so AuthGuard alone is enough — anyone may apply (spec FR-007), and
 * the service enforces the validated/suspended gates.
 */
@Controller('couriers')
@UseGuards(AuthGuard)
export class CouriersController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Post('register')
  async register(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(registerCourierSchema) body: z.infer<typeof registerCourierSchema>,
  ) {
    const profile = await this.deliveriesService.registerCourier(session.user.id, body)
    return DeliveriesMapper.toCourierProfileResponse(profile)
  }

  @Get('me')
  async me(@Session() session: LoggedInBetterAuthSession) {
    const profile = await this.deliveriesService.getMyProfile(session.user.id)
    return DeliveriesMapper.toCourierProfileResponse(profile)
  }

  @Patch('me')
  async updateMe(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(updateCourierSchema) body: z.infer<typeof updateCourierSchema>,
  ) {
    const profile = await this.deliveriesService.updateMyProfile(session.user.id, body)
    return DeliveriesMapper.toCourierProfileResponse(profile)
  }

  @Patch('me/availability')
  async setAvailability(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(updateAvailabilitySchema) body: z.infer<typeof updateAvailabilitySchema>,
  ) {
    const profile = await this.deliveriesService.setAvailability(session.user.id, body.isAvailable)
    return DeliveriesMapper.toCourierProfileResponse(profile)
  }

  @Patch('me/location')
  async updateLocation(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(updateLocationSchema) body: z.infer<typeof updateLocationSchema>,
  ) {
    await this.deliveriesService.updateLocation(session.user.id, body.latitude, body.longitude)
    return { ok: true }
  }
}
