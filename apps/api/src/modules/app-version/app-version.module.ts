import { Module } from '@nestjs/common'
import { PlatformSettingsModule } from '../settings/platform-settings.module'
import { AdminAppVersionController, AppVersionController } from './app-version.controller'

@Module({
  imports: [PlatformSettingsModule],
  controllers: [AppVersionController, AdminAppVersionController],
})
export class AppVersionModule {}
