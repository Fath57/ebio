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
 * The assistant, from the back-office: open or closed, and who she is.
 *
 * Every turn calls a paid model: it has to be possible to cut it off without
 * deploying, whether to contain spending or because it is answering badly. The
 * setting applies within the minute — the settings cache is cleared on write.
 *
 * Her name and her portrait sit here too. They are not decoration: the name
 * goes into her own instructions, and the portrait is the first thing a buyer
 * sees of her.
 */
@Controller('admin/assistant')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
export class AdminAssistantController {
  constructor(private readonly platformSettings: PlatformSettingsService) {}

  @CanRead('Settings')
  @Get()
  async get() {
    const identity = await this.platformSettings.getAssistantIdentity()
    return {
      enabled: await this.platformSettings.getAssistantEnabled(),
      name: identity.name,
      avatarUrl: identity.avatarUrl,
      voiceSpeed: identity.voiceSpeed,
    }
  }

  @CanManage('Settings')
  @Put()
  async update(@TypedBody(assistantSettingSchema) body: AssistantSettingInput) {
    await this.platformSettings.setAssistantEnabled(body.enabled)

    // Absent means "leave it alone", so the switch can still be flicked on its
    // own without the toggle silently renaming her.
    if (body.name !== undefined || body.avatarUrl !== undefined || body.voiceSpeed !== undefined) {
      const current = await this.platformSettings.getAssistantIdentity()
      await this.platformSettings.setAssistantIdentity({
        name: body.name ?? current.name,
        // `null` is a value here, not an omission: it puts back the portrait
        // shipped with the app.
        avatarUrl: body.avatarUrl !== undefined ? body.avatarUrl : current.avatarUrl,
        voiceSpeed: body.voiceSpeed ?? current.voiceSpeed,
      })
    }

    const identity = await this.platformSettings.getAssistantIdentity()
    return {
      enabled: await this.platformSettings.getAssistantEnabled(),
      name: identity.name,
      avatarUrl: identity.avatarUrl,
      voiceSpeed: identity.voiceSpeed,
    }
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
