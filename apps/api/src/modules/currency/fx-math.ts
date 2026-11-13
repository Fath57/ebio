import type { DisplayCurrency, ForeignCurrency } from './contracts/currency.contract'
import { FOREIGN_CURRENCIES } from './currency.constants'

/** Rates are stored as numeric(14,6). */
export function roundRate(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

/**
 * XOF for one unit, margin included: the reference rate lowered by the margin,
 * so the price shown is slightly higher than the reference conversion.
 */
export function effectiveRate(xofPerUnit: number, marginBps: number): number {
  return roundRate(xofPerUnit * (1 - marginBps / 10_000))
}

/**
 * An XOF amount in the display currency, rounded up to the cent: the payer
 * must never see less than what their bank will debit.
 */
export function toDisplayAmount(xof: number, rate: number): number {
  // toFixed absorbs the float noise of an exact division (6 559.57 / 655.957
  // must give 10.00, not 10.01).
  const cents = Number((xof / rate * 100).toFixed(6))
  return Math.ceil(cents) / 100
}

export function isForeignCurrency(currency: DisplayCurrency): currency is ForeignCurrency {
  return (FOREIGN_CURRENCIES as readonly string[]).includes(currency)
}

/** Effective rate of every currency that has one, for the apps. */
export function publicRates(
  rates: Partial<Record<ForeignCurrency, { xofPerUnit: number }>>,
  marginBps: number,
): Partial<Record<ForeignCurrency, { rate: number }>> {
  const result: Partial<Record<ForeignCurrency, { rate: number }>> = {}
  for (const currency of FOREIGN_CURRENCIES) {
    const rate = rates[currency]
    if (rate) {
      result[currency] = { rate: effectiveRate(rate.xofPerUnit, marginBps) }
    }
  }
  return result
}
