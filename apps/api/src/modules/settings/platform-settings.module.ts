import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { PlatformSetting } from './platform-setting.entity'
import { PlatformSettingsService } from './platform-settings.service'
import { PublicSettingsController } from './public-settings.controller'

@Module({
  imports: [MikroOrmModule.forFeature([PlatformSetting])],
  controllers: [PublicSettingsController],
  providers: [PlatformSettingsService],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
