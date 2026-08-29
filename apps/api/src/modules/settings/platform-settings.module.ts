import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { PlatformSetting } from './platform-setting.entity'
import { PlatformSettingsService } from './platform-settings.service'

@Module({
  imports: [MikroOrmModule.forFeature([PlatformSetting])],
  providers: [PlatformSettingsService],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
