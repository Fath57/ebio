import { z } from 'zod'
import { FOREIGN_CURRENCIES, FX_MARGIN_BPS_MAX, SUPPORTED_DISPLAY_CURRENCIES } from '../currency.constants'

export const displayCurrencyEnum = z.enum(SUPPORTED_DISPLAY_CURRENCIES).meta({
  title: 'DisplayCurrency',
  description: 'Devise d\'affichage des prix ; le paiement reste en FCFA',
})

export const foreignCurrencyEnum = z.enum(FOREIGN_CURRENCIES).meta({
  title: 'ForeignCurrency',
  description: 'Devise étrangère disposant d\'un taux de change vers le FCFA',
})

export const exchangeRateSourceEnum = z.enum(['AUTO', 'MANUAL']).meta({
  title: 'ExchangeRateSource',
  description: 'AUTO : téléchargé (BCE) ; MANUAL : saisi au back-office',
})

/** Reference rate, margin excluded: XOF for one unit of the currency. */
export const exchangeRateSchema = z.object({
  xofPerUnit: z.number().positive(),
  source: exchangeRateSourceEnum,
  /** Null on the built-in EUR parity, which nobody has saved yet. */
  updatedAt: z.string().datetime().nullable(),
}).meta({ title: 'ExchangeRate', description: 'Taux de référence, en FCFA pour une unité' })

/** The stored `exchange_rates` setting: any currency may be missing. */
export const exchangeRatesSchema = z.object({
  EUR: exchangeRateSchema.optional(),
  USD: exchangeRateSchema.optional(),
  CAD: exchangeRateSchema.optional(),
}).meta({ title: 'ExchangeRates', description: 'Taux de référence par devise' })

export const fxMarginBpsSchema = z.number().int().min(0).max(FX_MARGIN_BPS_MAX)

export type DisplayCurrency = z.infer<typeof displayCurrencyEnum>
export type ForeignCurrency = z.infer<typeof foreignCurrencyEnum>
export type ExchangeRateSource = z.infer<typeof exchangeRateSourceEnum>
export type ExchangeRate = z.infer<typeof exchangeRateSchema>
export type ExchangeRates = z.infer<typeof exchangeRatesSchema>

/** A rate typed in the back-office; a sanity ceiling keeps a slipped digit out. */
const manualRate = z.number().positive().max(100_000)

/** `PUT /admin/exchange-rates`: each currency optional, saved as `MANUAL`. */
export const adminExchangeRatesInputSchema = z.object({
  EUR: manualRate.optional(),
  USD: manualRate.optional(),
  CAD: manualRate.optional(),
}).refine(input => input.EUR !== undefined || input.USD !== undefined || input.CAD !== undefined, {
  message: 'Indiquez au moins un taux',
}).meta({ title: 'AdminExchangeRatesInput', description: 'Taux saisis à la main, en FCFA pour une unité' })

/** `PUT /admin/fx-margin`. */
export const adminFxMarginInputSchema = z.object({
  bps: fxMarginBpsSchema,
}).meta({ title: 'AdminFxMarginInput', description: 'Marge de change en points de base (200 = 2 %)' })

export const adminExchangeRateSchema = exchangeRateSchema.extend({
  /** A downloaded rate older than 72 h; never true for EUR. */
  stale: z.boolean(),
}).meta({ title: 'AdminExchangeRate', description: 'Taux de référence et son ancienneté' })

export const adminExchangeRatesResponseSchema = z.object({
  marginBps: z.number().int(),
  rates: z.object({
    EUR: adminExchangeRateSchema.optional(),
    USD: adminExchangeRateSchema.optional(),
    CAD: adminExchangeRateSchema.optional(),
  }),
}).meta({ title: 'AdminExchangeRates', description: 'Taux de référence et marge, pour le back-office' })

export const adminExchangeRatesRefreshResponseSchema = adminExchangeRatesResponseSchema.extend({
  /** False when the download failed: the previous rates stay in force. */
  refreshed: z.boolean(),
}).meta({ title: 'AdminExchangeRatesRefresh', description: 'Résultat d\'un téléchargement relancé à la main' })

export type AdminExchangeRatesInput = z.infer<typeof adminExchangeRatesInputSchema>
export type AdminFxMarginInput = z.infer<typeof adminFxMarginInputSchema>
export type AdminExchangeRatesResponse = z.infer<typeof adminExchangeRatesResponseSchema>
