import type { DisplayCurrency, ExchangeRate, ForeignCurrency } from './contracts/currency.contract'
import { Injectable } from '@nestjs/common'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { FOREIGN_CURRENCIES, RATE_STALE_HOURS } from './currency.constants'
import { effectiveRate, isForeignCurrency, publicRates, toDisplayAmount } from './fx-math'

const HOUR_MS = 60 * 60 * 1000

/** What a checkout keeps of the conversion it was shown. */
export interface FrozenConversion {
  /** XOF for one unit, margin included. */
  fxRate: number
  fxMarginBps: number
  displayTotal: number
}

export type AdminExchangeRate = ExchangeRate & { stale: boolean }

export interface AdminExchangeRatesView {
  marginBps: number
  rates: Partial<Record<ForeignCurrency, AdminExchangeRate>>
}

/**
 * Converts FCFA amounts for display. The amount collected is always the FCFA
 * total; this only decides what the payer reads, and what the checkout
 * freezes so the order keeps showing what was agreed.
 */
@Injectable()
export class ExchangeRatesService {
  constructor(private readonly platformSettings: PlatformSettingsService) {}

  /** XOF for one unit, margin included; null for XOF or a currency without a rate yet. */
  async effectiveRate(currency: DisplayCurrency): Promise<number | null> {
    if (!isForeignCurrency(currency)) {
      return null
    }
    const rates = await this.platformSettings.getExchangeRates()
    const rate = rates[currency]
    if (!rate) {
      return null
    }
    return effectiveRate(rate.xofPerUnit, await this.platformSettings.getFxMarginBps())
  }

  /** The amount in the display currency, rounded up to the cent; null when shown in FCFA. */
  async toDisplay(xof: number, currency: DisplayCurrency): Promise<number | null> {
    const rate = await this.effectiveRate(currency)
    return rate === null ? null : toDisplayAmount(xof, rate)
  }

  /**
   * The conversion a checkout keeps. Null for XOF, and for a currency whose
   * rate was never obtained: the checkout then simply stays in FCFA.
   */
  async freeze(totalXof: number, currency: DisplayCurrency): Promise<FrozenConversion | null> {
    if (!isForeignCurrency(currency)) {
      return null
    }
    const rates = await this.platformSettings.getExchangeRates()
    const rate = rates[currency]
    if (!rate) {
      return null
    }
    const fxMarginBps = await this.platformSettings.getFxMarginBps()
    const fxRate = effectiveRate(rate.xofPerUnit, fxMarginBps)
    return { fxRate, fxMarginBps, displayTotal: toDisplayAmount(totalXof, fxRate) }
  }

  /** Effective rates for `/settings/public`. */
  async publicRates(): Promise<Partial<Record<ForeignCurrency, { rate: number }>>> {
    const rates = await this.platformSettings.getExchangeRates()
    return publicRates(rates, await this.platformSettings.getFxMarginBps())
  }

  /**
   * Reference rates for the back-office, each flagged when its download is
   * late. The euro is never stale: it depends on no download.
   */
  async adminView(now: Date = new Date()): Promise<AdminExchangeRatesView> {
    const rates = await this.platformSettings.getExchangeRates()
    const view: AdminExchangeRatesView = {
      marginBps: await this.platformSettings.getFxMarginBps(),
      rates: {},
    }
    for (const currency of FOREIGN_CURRENCIES) {
      const rate = rates[currency]
      if (!rate) {
        continue
      }
      const age = rate.updatedAt ? now.getTime() - new Date(rate.updatedAt).getTime() : Number.POSITIVE_INFINITY
      view.rates[currency] = { ...rate, stale: currency !== 'EUR' && age > RATE_STALE_HOURS * HOUR_MS }
    }
    return view
  }
}
