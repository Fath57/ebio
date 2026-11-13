import {
  adminExchangeRatesControllerGet,
  adminExchangeRatesControllerRefresh,
  adminExchangeRatesControllerUpdate,
  adminExchangeRatesControllerUpdateMargin,
} from '@boilerstone/openapi-generator/client/sdk.gen'

/** Currencies a payer abroad may pay in, besides FCFA. */
export const FX_CURRENCIES = ['EUR', 'USD', 'CAD'] as const
export type FxCurrency = typeof FX_CURRENCIES[number]

export interface ExchangeRateEntry {
  /** FCFA for one unit of the currency, margin excluded. */
  xofPerUnit: number
  source: 'AUTO' | 'MANUAL'
  updatedAt: string | null
  /** Not updated for more than 72 h; never true for EUR (fixed parity). */
  stale: boolean
}

export interface ExchangeRatesData {
  /** Exchange margin in basis points (200 = 2 %). */
  marginBps: number
  rates: Partial<Record<FxCurrency, ExchangeRateEntry>>
}

export interface ExchangeRatesRefreshResult extends ExchangeRatesData {
  /** False when the rate provider could not be reached: the previous rates stay. */
  refreshed: boolean
}

export const EXCHANGE_RATES_QUERY_KEY = ['admin', 'exchange-rates']

export function fetchExchangeRatesQueryOptions() {
  return {
    queryKey: EXCHANGE_RATES_QUERY_KEY,
    queryFn: async () => {
      const response = await adminExchangeRatesControllerGet()
      if (response.error)
        throw new Error('Failed to fetch exchange rates')
      return response.data as ExchangeRatesData
    },
  }
}

export interface ExchangeRatesUpdate {
  /** Only the rates the admin changed: each one sent becomes MANUAL. */
  rates: Partial<Record<FxCurrency, number>>
  /** Sent only when the margin changed. */
  marginBps?: number
}

export async function updateExchangeRates({ rates, marginBps }: ExchangeRatesUpdate): Promise<void> {
  if (Object.keys(rates).length > 0) {
    const response = await adminExchangeRatesControllerUpdate({ body: rates })
    if (response.error)
      throw new Error('Failed to update exchange rates')
  }
  if (marginBps !== undefined) {
    const response = await adminExchangeRatesControllerUpdateMargin({ body: { bps: marginBps } })
    if (response.error)
      throw new Error('Failed to update exchange margin')
  }
}

export async function refreshExchangeRates(): Promise<ExchangeRatesRefreshResult> {
  const response = await adminExchangeRatesControllerRefresh()
  if (response.error)
    throw new Error('Failed to refresh exchange rates')
  return response.data as ExchangeRatesRefreshResult
}
