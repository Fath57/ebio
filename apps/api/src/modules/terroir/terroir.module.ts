import { Module } from '@nestjs/common'
import { SmsModule } from '../../common/sms.module'
import { CurrencyModule } from '../currency/currency.module'
import { EmailModule } from '../email/email.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { OrderEmailsModule } from '../orders/order-emails.module'
import { OrdersModule } from '../orders/orders.module'
import { PaymentsModule } from '../payments/payments.module'
import { PlatformSettingsModule } from '../settings/platform-settings.module'
import { SuppliersModule } from '../suppliers/suppliers.module'
import { WalletModule } from '../wallet/wallet.module'
import { AdminExportController } from './admin-export.controller'
import { ExportCatalogService } from './export-catalog.service'
import { ExportLogisticsService } from './export-logistics.service'
import { ExportShipmentsService } from './export-shipments.service'
import { ExportSupplementService } from './export-supplement.service'
import { SupplierExportController } from './supplier-export.controller'
import { TerroirCheckoutService } from './terroir-checkout.service'
import { TerroirClientController } from './terroir-client.controller'
import { TerroirEnabledGuard } from './terroir-enabled.guard'
import { TerroirNotifierService } from './terroir-notifier.service'
import { TerroirSettlementService } from './terroir-settlement.service'
import { TerroirScheduler } from './terroir.scheduler'

/**
 * Terroir sent abroad (011): exportable products and packs, partner agencies
 * and their departures, the terroir checkout and the parcels it ships.
 *
 * Shipped closed: buyer routes answer 403 while `terroir_export_enabled` is
 * off; the back office and the shops prepare the opening meanwhile.
 */
@Module({
  imports: [
    CurrencyModule,
    EmailModule,
    NotificationsModule,
    OrderEmailsModule,
    OrdersModule,
    PaymentsModule,
    PlatformSettingsModule,
    SmsModule,
    SuppliersModule,
    WalletModule,
  ],
  controllers: [AdminExportController, SupplierExportController, TerroirClientController],
  providers: [
    ExportCatalogService,
    ExportLogisticsService,
    ExportShipmentsService,
    ExportSupplementService,
    TerroirCheckoutService,
    TerroirSettlementService,
    TerroirNotifierService,
    TerroirEnabledGuard,
    TerroirScheduler,
  ],
  exports: [ExportCatalogService, ExportLogisticsService, ExportShipmentsService, ExportSupplementService, TerroirScheduler, TerroirCheckoutService, TerroirSettlementService, TerroirNotifierService, TerroirEnabledGuard],
})
export class TerroirModule {}
