/** Currencies prices can be shown in. Payment is always collected in XOF. */
export const SUPPORTED_DISPLAY_CURRENCIES = ['XOF', 'EUR', 'USD', 'CAD'] as const

/** Currencies with a rate to XOF; XOF itself needs none. */
export const FOREIGN_CURRENCIES = ['EUR', 'USD', 'CAD'] as const

/** Fixed CFA franc parity: 1 EUR = 655.957 XOF. */
export const EUR_OFFICIAL_PARITY = 655.957

/**
 * Margin taken off the reference rate, in basis points (200 = 2 %). Not a
 * revenue: the payer's bank converts at a worse rate than the ECB, and the
 * margin keeps the amount shown from being lower than the amount debited.
 */
export const DEFAULT_FX_MARGIN_BPS = 200
export const FX_MARGIN_BPS_MAX = 1000

/** A downloaded rate older than this is flagged in the back-office. */
export const RATE_STALE_HOURS = 72
