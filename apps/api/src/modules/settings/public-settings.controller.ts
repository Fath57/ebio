import { Controller, Get } from '@nestjs/common'
import { PlatformSettingsService } from './platform-settings.service'

/** Settings the apps need before sign-in or at checkout; nothing sensitive here. */
@Controller('settings')
export class PublicSettingsController {
  constructor(private readonly platformSettings: PlatformSettingsService) {}

  @Get('public')
  async getPublic() {
    const cashOnDeliveryMaxAmount = await this.platformSettings.getCashOnDeliveryMaxAmount()
    const courierMaxDebt = await this.platformSettings.getCourierMaxDebt()
    return { cashOnDeliveryMaxAmount, courierMaxDebt }
  }
}
