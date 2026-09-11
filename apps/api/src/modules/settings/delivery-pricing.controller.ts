import type { BannerOffersInput, DeliveryPricingConfigInput, DeliveryQuoteRequest } from './contracts/delivery-pricing.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Get, Post, Put, UseGuards } from '@nestjs/common'
import { CanManage, CanRead } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { AuthGuard } from '../auth/auth.guard'
import { bannerOffersSchema, deliveryPricingConfigSchema, deliveryQuoteRequestSchema } from './contracts/delivery-pricing.contract'
import { DeliveryPricingService } from './delivery-pricing.service'
import { PlatformSettingsService } from './platform-settings.service'

/** Checkout-side quote: any signed-in user may ask what a delivery would cost. */
@Controller('delivery-pricing')
@UseGuards(AuthGuard)
export class DeliveryPricingController {
  constructor(private readonly pricing: DeliveryPricingService) {}

  @Post('quote')
  async quote(@TypedBody(deliveryQuoteRequestSchema) body: DeliveryQuoteRequest) {
    return this.pricing.quote({ ...body, isDelivery: true })
  }
}

@Controller('admin/delivery-pricing')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
export class AdminDeliveryPricingController {
  constructor(private readonly platformSettings: PlatformSettingsService) {}

  @CanRead('Settings')
  @Get()
  async get() {
    return this.platformSettings.getDeliveryPricing()
  }

  @CanManage('Settings')
  @Put()
  async update(@TypedBody(deliveryPricingConfigSchema) body: DeliveryPricingConfigInput) {
    await this.platformSettings.setDeliveryPricing(body)
    return this.platformSettings.getDeliveryPricing()
  }
}

@Controller('admin/banner-offers')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
export class AdminBannerOffersController {
  constructor(private readonly platformSettings: PlatformSettingsService) {}

  @CanRead('Settings')
  @Get()
  async get() {
    return this.platformSettings.getBannerOffers()
  }

  @CanManage('Settings')
  @Put()
  async update(@TypedBody(bannerOffersSchema) body: BannerOffersInput) {
    await this.platformSettings.setBannerOffers(body)
    return this.platformSettings.getBannerOffers()
  }
}
