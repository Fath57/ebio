import { EnsureRequestContext } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { SingleInstance } from '../db/cron-lock'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { EUR_OFFICIAL_PARITY } from './currency.constants'
import { EcbRatesClient } from './ecb-rates.client'
import { roundRate } from './fx-math'

/**
 * Downloads the dollar rates every morning.
 *
 * USD and CAD in XOF follow from the ECB euro crosses and the official
 * parity, never from the euro rate saved in the back-office, so correcting
 * the euro does not distort the dollar. The euro itself is never touched.
 */
@Injectable()
export class ExchangeRatesScheduler {
  private readonly logger = new Logger(ExchangeRatesScheduler.name)

  constructor(
    // Read by @EnsureRequestContext to fork a context for the cron run.
    private readonly em: EntityManager,
    private readonly platformSettings: PlatformSettingsService,
    private readonly ecb: EcbRatesClient,
  ) {}

  @Cron('0 6 * * *')
  @SingleInstance()
  @EnsureRequestContext()
  async refreshDaily(): Promise<void> {
    await this.refresh()
  }

  /**
   * One download. On failure the last rates stay in force and the back-office
   * flags them once they are too old; nothing is thrown.
   */
  async refresh(): Promise<boolean> {
    try {
      const cross = await this.ecb.fetchEurCross()
      await this.platformSettings.setExchangeRates({
        USD: roundRate(EUR_OFFICIAL_PARITY / cross.USD),
        CAD: roundRate(EUR_OFFICIAL_PARITY / cross.CAD),
      }, 'AUTO')
      return true
    }
    catch (error) {
      this.logger.warn(`Exchange rate download failed, keeping the last rates: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }
}
