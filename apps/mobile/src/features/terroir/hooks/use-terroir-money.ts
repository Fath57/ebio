import type { FormattedMoney } from '../../common/hooks/use-money'
import type { DisplayBlock } from '../terroir-api'
import { useCallback } from 'react'
import { useCurrency } from '../../common/currency-context'
import { formatCurrencyAmount, formatMoney, formatXof } from '../../common/hooks/use-money'
import { useTerroirCart } from '../terroir-cart-context'

/**
 * Terroir prices are read from the destination country: they show in its
 * currency (euros, dollars…), with FCFA beside them, whatever the app-wide
 * currency. Without a known rate for it they fall back to FCFA alone.
 */
export function useTerroirMoney() {
  const { rates } = useCurrency()
  const { countryInfo } = useTerroirCart()
  const preferred = countryInfo?.displayCurrency ?? 'EUR'
  const currency = rates[preferred] ? preferred : 'XOF'

  const format = useCallback(
    (xof: number): FormattedMoney => formatMoney(xof, currency, rates),
    [currency, rates],
  )

  /** A server amount: its frozen conversion when the block carries it, else today's rate. */
  const formatServer = useCallback(
    (xof: number, display: DisplayBlock | null, field: string): FormattedMoney => {
      const converted = display?.values[field]
      if (display && converted !== undefined) {
        const primary = formatCurrencyAmount(converted, display.currency)
        return { primary, secondary: formatXof(xof), amount: primary, symbol: '' }
      }
      return format(xof)
    },
    [format],
  )

  return { formatMoney: format, formatServer, displayCurrency: currency }
}
