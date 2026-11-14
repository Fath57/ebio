import { Module } from '@nestjs/common'
import { PlatformSettingsModule } from '../settings/platform-settings.module'
import { ExportCountriesService } from './export-countries.service'
import { ExportabilityService } from './exportability.service'

/**
 * The part of terroir the product pages need (« mode Valise »): destination
 * countries and exportability. Kept apart from TerroirModule, which depends
 * on orders, which depend on products.
 */
@Module({
  imports: [PlatformSettingsModule],
  providers: [ExportCountriesService, ExportabilityService],
  exports: [ExportCountriesService, ExportabilityService],
})
export class TerroirExportabilityModule {}
