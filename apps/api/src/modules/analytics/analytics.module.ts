import { Module } from '@nestjs/common'
import { AnalyticsController } from './analytics.controller'
import { FunnelService } from './funnel.service'

/**
 * Where people stop, as opposed to how many there are.
 *
 * Kept apart from the dashboard's counters: those answer "how is it going",
 * this one answers "what should we change".
 */
@Module({
  controllers: [AnalyticsController],
  providers: [FunnelService],
})
export class AnalyticsModule {}
