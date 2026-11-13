import type { AdminExchangeRatesInput, AdminFxMarginInput } from './contracts/currency.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Get, Post, Put, UseGuards } from '@nestjs/common'
import { CanManage, CanRead } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { AuthGuard } from '../auth/auth.guard'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { adminExchangeRatesInputSchema, adminFxMarginInputSchema } from './contracts/currency.contract'
import { ExchangeRatesScheduler } from './exchange-rates.scheduler'
import { ExchangeRatesService } from './exchange-rates.service'

/**
 * Exchange rates, from the back-office.
 *
 * A wrong rate shows the diaspora a wrong price: it must be correctable the
 * same day, without deploying. A typed rate is `MANUAL`; for USD and CAD the
 * next daily download replaces it, the euro is never overwritten.
 */
@Controller('admin')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
export class AdminExchangeRatesController {
  constructor(
    private readonly rates: ExchangeRatesService,
    private readonly scheduler: ExchangeRatesScheduler,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  @CanRead('Settings')
  @Get('exchange-rates')
  async get() {
    return this.rates.adminView()
  }

  @CanManage('Settings')
  @Put('exchange-rates')
  async update(@TypedBody(adminExchangeRatesInputSchema) body: AdminExchangeRatesInput) {
    await this.platformSettings.setExchangeRates(body, 'MANUAL')
    return this.rates.adminView()
  }

  @CanManage('Settings')
  @Put('fx-margin')
  async updateMargin(@TypedBody(adminFxMarginInputSchema) body: AdminFxMarginInput) {
    await this.platformSettings.setFxMarginBps(body.bps)
    return this.rates.adminView()
  }

  /** Downloads now rather than waiting for tomorrow morning. */
  @CanManage('Settings')
  @Post('exchange-rates/refresh')
  async refresh() {
    const refreshed = await this.scheduler.refresh()
    return { refreshed, ...await this.rates.adminView() }
  }
}
