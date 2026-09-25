import type { AssistantSettingInput, BannerOffersInput, DeliveryPricingConfigInput, DeliveryQuoteRequest, ProductReviewTimingInput } from './contracts/delivery-pricing.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Get, Post, Put, UseGuards } from '@nestjs/common'
import { CanManage, CanRead } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { AuthGuard } from '../auth/auth.guard'
import { assistantSettingSchema, bannerOffersSchema, deliveryPricingConfigSchema, deliveryQuoteRequestSchema, productReviewTimingSchema } from './contracts/delivery-pricing.contract'
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

/**
 * The assistant, open or closed, from the back-office.
 *
 * Every turn calls a paid model: it has to be possible to cut it off without
 * deploying, whether to contain spending or because it is answering badly. The
 * setting applies within the minute — the settings cache is cleared on write.
 */
@Controller('admin/assistant')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
export class AdminAssistantController {
  constructor(private readonly platformSettings: PlatformSettingsService) {}

  @CanRead('Settings')
  @Get()
  async get() {
    return { enabled: await this.platformSettings.getAssistantEnabled() }
  }

  @CanManage('Settings')
  @Put()
  async update(@TypedBody(assistantSettingSchema) body: AssistantSettingInput) {
    await this.platformSettings.setAssistantEnabled(body.enabled)
    return { enabled: await this.platformSettings.getAssistantEnabled() }
  }
}

/**
 * When the buyer is asked for their review.
 *
 * Configurable because the right delay depends on what is sold: twelve hours
 * suit food, and would be far too early for soap.
 */
@Controller('admin/product-review-timing')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
export class AdminProductReviewTimingController {
  constructor(private readonly platformSettings: PlatformSettingsService) {}

  @CanRead('Settings')
  @Get()
  async get() {
    return {
      delaiHeures: await this.platformSettings.getProductReviewDelayHours(),
      relancesMaximum: await this.platformSettings.getProductReviewMaxInvites(),
    }
  }

  @CanManage('Settings')
  @Put()
  async update(@TypedBody(productReviewTimingSchema) body: ProductReviewTimingInput) {
    await this.platformSettings.setProductReviewDelayHours(body.delaiHeures)
    await this.platformSettings.setProductReviewMaxInvites(body.relancesMaximum)
    return {
      delaiHeures: await this.platformSettings.getProductReviewDelayHours(),
      relancesMaximum: await this.platformSettings.getProductReviewMaxInvites(),
    }
  }
}
