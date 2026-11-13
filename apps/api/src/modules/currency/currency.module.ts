import { Module } from '@nestjs/common'
import { PlatformSettingsModule } from '../settings/platform-settings.module'
import { AdminExchangeRatesController } from './admin-exchange-rates.controller'
import { EcbRatesClient } from './ecb-rates.client'
import { ExchangeRatesScheduler } from './exchange-rates.scheduler'
import { ExchangeRatesService } from './exchange-rates.service'

/** Display currencies: exchange rates, their daily download, conversions. */
@Module({
  imports: [PlatformSettingsModule],
  controllers: [AdminExchangeRatesController],
  providers: [EcbRatesClient, ExchangeRatesService, ExchangeRatesScheduler],
  exports: [ExchangeRatesService, ExchangeRatesScheduler],
})
export class CurrencyModule {}
