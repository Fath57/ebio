import type { FormattedMoney } from '../../common/hooks/use-money'
import type { DisplayBlock } from '../terroir-api'
import { useCallback } from 'react'
import { useCurrency } from '../../common/currency-context'
import { formatCurrencyAmount, formatMoney, formatXof } from '../../common/hooks/use-money'

/**
 * Terroir prices are read from France or Belgium: they show in euros, with
 * FCFA beside them, whatever the app-wide currency. Without a known euro rate
 * they fall back to FCFA alone.
 */
export function useTerroirMoney() {
  const { rates } = useCurrency()
  const hasEuro = Boolean(rates.EUR)

  const format = useCallback(
    (xof: number): FormattedMoney => formatMoney(xof, hasEuro ? 'EUR' : 'XOF', rates),
    [hasEuro, rates],
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

  return { formatMoney: format, formatServer, displayCurrency: hasEuro ? 'EUR' : 'XOF' }
}
