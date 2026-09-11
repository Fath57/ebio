import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
import { PlatformSettingsModule } from '../settings/platform-settings.module'
import { SuppliersModule } from '../suppliers/suppliers.module'
import { WalletModule } from '../wallet/wallet.module'
import { AdminBannerRequestsController, SupplierBannerRequestsController } from './banner-requests.controller'
import { BannerRequestsService } from './banner-requests.service'
import { BannersController } from './banners.controller'
import { BannersService } from './banners.service'

@Module({
  imports: [PlatformSettingsModule, WalletModule, NotificationsModule, SuppliersModule],
  controllers: [BannersController, SupplierBannerRequestsController, AdminBannerRequestsController],
  providers: [BannersService, BannerRequestsService],
  exports: [BannersService],
})
export class BannersModule {}
