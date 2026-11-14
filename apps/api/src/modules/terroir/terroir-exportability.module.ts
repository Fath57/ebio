import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
import { PlatformSettingsModule } from '../settings/platform-settings.module'
import { ExportCountriesService } from './export-countries.service'
import { ExportCriteriaService } from './export-criteria.service'
import { ExportabilityService } from './exportability.service'

/**
 * The part of terroir the product pages need (« mode Valise »): destination
 * countries, exportability and the automatic export criteria (the product
 * sheet feeds them). Kept apart from TerroirModule, which depends
 * on orders, which depend on products.
 */
@Module({
  imports: [NotificationsModule, PlatformSettingsModule],
  providers: [ExportCountriesService, ExportabilityService, ExportCriteriaService],
  exports: [ExportCountriesService, ExportabilityService, ExportCriteriaService],
})
export class TerroirExportabilityModule {}
