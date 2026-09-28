import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
import { PlatformSettingsModule } from '../settings/platform-settings.module'
import { WalletModule } from '../wallet/wallet.module'
import { ReferralsController } from './referrals.controller'
import { ReferralsService } from './referrals.service'

@Module({
  imports: [WalletModule, PlatformSettingsModule, NotificationsModule],
  controllers: [ReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
