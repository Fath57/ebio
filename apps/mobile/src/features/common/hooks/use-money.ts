import type { CurrencyRates, DisplayCurrency } from '../currency-context'
import { useCallback } from 'react'
import { useCurrency } from '../currency-context'

export interface FormattedMoney {
  /** The amount in the chosen currency. */
  primary: string
  /** The FCFA amount, shown beside a foreign one; null when already in FCFA. */
  secondary: string | null
  /** `primary` without its symbol (« 30,50 »), for layouts that style the symbol apart. */
  amount: string
  /** The symbol ending `primary` (« FCFA », « € », « $ US », « $ CA »). */
  symbol: string
}

const SYMBOLS: Record<Exclude<DisplayCurrency, 'XOF'>, string> = {
  EUR: '€',
  USD: '$ US',
  CAD: '$ CA',
}

/**
 * Groups thousands with a plain space. Hermes may give a narrow no-break
 * space, a no-break space or a comma depending on its Intl support: all
 * become the same space.
 */
function groupThousands(value: number): string {
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 0 }).replace(/[,\u202F\xA0]/g, ' ')
}

/** « 6 560 FCFA » */
export function formatXof(xof: number): string {
  return `${groupThousands(Math.round(xof))} FCFA`
}

/**
 * Formats an amount already in a foreign currency — the frozen `display`
 * block of a preview or an order — without converting it again: « 30,50 € ».
 */
export function formatCurrencyAmount(value: number, currency: Exclude<DisplayCurrency, 'XOF'>): string {
  const cents = Math.round(value * 100)
  const units = Math.floor(cents / 100)
  const rest = String(cents % 100).padStart(2, '0')
  return `${groupThousands(units)},${rest} ${SYMBOLS[currency]}`
}

/**
 * Formats an FCFA amount in the display currency. Foreign amounts round up
 * to the cent, so the buyer never sees less than what will be charged.
 */
export function formatMoney(xof: number, currency: DisplayCurrency, rates: CurrencyRates): FormattedMoney {
  const fcfa = formatXof(xof)
  const rate = currency === 'XOF' ? undefined : rates[currency]
  if (currency === 'XOF' || !rate)
    return { primary: fcfa, secondary: null, amount: groupThousands(Math.round(xof)), symbol: 'FCFA' }

  // toFixed trims float noise (1021.0000000001) before rounding up.
  const cents = Math.ceil(Number((xof / rate * 100).toFixed(6)))
  const units = Math.floor(cents / 100)
  const rest = String(cents % 100).padStart(2, '0')
  const amount = `${groupThousands(units)},${rest}`
  return {
    primary: `${amount} ${SYMBOLS[currency]}`,
    secondary: fcfa,
    amount,
    symbol: SYMBOLS[currency],
  }
}

/** Formats FCFA amounts in the buyer's chosen currency. */
export function useMoney() {
  const { currency, rates } = useCurrency()
  const format = useCallback(
    (xof: number): FormattedMoney => formatMoney(xof, currency, rates),
    [currency, rates],
  )
  return { formatMoney: format, currency }
}

/** The currency block frozen on a checkout (`order.display`). */
export interface FrozenDisplay {
  currency: Exclude<DisplayCurrency, 'XOF'>
  /** FCFA per unit, margin included, as frozen at checkout. */
  rate: number
}

/** Reads an order's untyped `display` block; null for FCFA or a malformed one. */
export function parseFrozenDisplay(raw: unknown): FrozenDisplay | null {
  if (!raw || typeof raw !== 'object')
    return null
  const block = raw as Record<string, unknown>
  const rate = Number(block.rate)
  const currency = block.currency
  if ((currency !== 'EUR' && currency !== 'USD' && currency !== 'CAD') || !Number.isFinite(rate) || rate <= 0)
    return null
  return { currency, rate }
}

/**
 * An order amount at the rate frozen on its checkout — never today's rate:
 * the order reads the same in a month. FCFA alone when nothing was frozen.
 */
export function formatFrozenMoney(xof: number, display: FrozenDisplay | null): FormattedMoney {
  if (!display)
    return formatMoney(xof, 'XOF', {})
  return formatMoney(xof, display.currency, { [display.currency]: display.rate })
}
