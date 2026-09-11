import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { AdminBannerOffersController, AdminDeliveryPricingController, DeliveryPricingController } from './delivery-pricing.controller'
import { DeliveryPricingService } from './delivery-pricing.service'
import { PlatformSetting } from './platform-setting.entity'
import { PlatformSettingsService } from './platform-settings.service'
import { PublicSettingsController } from './public-settings.controller'

@Module({
  imports: [MikroOrmModule.forFeature([PlatformSetting])],
  controllers: [PublicSettingsController, DeliveryPricingController, AdminDeliveryPricingController, AdminBannerOffersController],
  providers: [PlatformSettingsService, DeliveryPricingService],
  exports: [PlatformSettingsService, DeliveryPricingService],
})
export class PlatformSettingsModule {}
