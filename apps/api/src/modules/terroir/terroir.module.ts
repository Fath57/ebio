import { Module } from '@nestjs/common'
import { EmailModule } from '../email/email.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { PlatformSettingsModule } from '../settings/platform-settings.module'
import { SuppliersModule } from '../suppliers/suppliers.module'
import { WalletModule } from '../wallet/wallet.module'
import { AdminExportController } from './admin-export.controller'
import { ExportCatalogService } from './export-catalog.service'
import { ExportLogisticsService } from './export-logistics.service'
import { SupplierExportController } from './supplier-export.controller'
import { TerroirEnabledGuard } from './terroir-enabled.guard'
import { TerroirNotifierService } from './terroir-notifier.service'

/**
 * Terroir sent abroad (011): exportable products and packs, partner agencies
 * and their departures, and — in later waves — the terroir checkout and the
 * parcels it ships.
 *
 * Shipped closed: buyer routes answer 403 while `terroir_export_enabled` is
 * off; the back office and the shops prepare the opening meanwhile.
 */
@Module({
  imports: [
    EmailModule,
    NotificationsModule,
    PlatformSettingsModule,
    SuppliersModule,
    WalletModule,
  ],
  controllers: [AdminExportController, SupplierExportController],
  providers: [
    ExportCatalogService,
    ExportLogisticsService,
    TerroirNotifierService,
    TerroirEnabledGuard,
  ],
  exports: [ExportCatalogService, ExportLogisticsService, TerroirNotifierService, TerroirEnabledGuard],
})
export class TerroirModule {}
