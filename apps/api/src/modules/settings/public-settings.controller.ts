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
    const bannerOffers = await this.platformSettings.getBannerOffers()
    // The apps hide the assistant's entry point when it is closed: a button
    // that answers "indisponible" is worse than no button.
    const assistantEnabled = await this.platformSettings.getAssistantEnabled()
    // Her name and her face travel with the switch: the apps write her name
    // into their own labels, and a null portrait means the one they ship.
    const assistant = await this.platformSettings.getAssistantIdentity()
    return {
      cashOnDeliveryMaxAmount,
      courierMaxDebt,
      bannerOffers,
      assistantEnabled,
      assistantName: assistant.name,
      assistantAvatarUrl: assistant.avatarUrl,
    }
  }
}
