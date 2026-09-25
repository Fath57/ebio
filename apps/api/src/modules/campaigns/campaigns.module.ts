import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
import { CampaignsController } from './campaigns.controller'
import { CampaignsService } from './campaigns.service'

/**
 * Notifications written on purpose, as opposed to the ones an order causes.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [CampaignsController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
