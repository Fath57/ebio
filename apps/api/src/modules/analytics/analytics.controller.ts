import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { CanRead } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { AuthGuard } from '../auth/auth.guard'
import { FunnelService } from './funnel.service'

/** Windows worth offering: a week to act on, a month to see a shape. */
const ALLOWED_DAYS = [7, 30, 90]

@Controller('admin/analytics')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
export class AnalyticsController {
  constructor(private readonly funnel: FunnelService) {}

  @CanRead('Order')
  @Get('funnel')
  async funnelReport(@Query('days') days?: string) {
    const requested = Number(days)
    const window = ALLOWED_DAYS.includes(requested) ? requested : 7
    return this.funnel.report(window)
  }
}
