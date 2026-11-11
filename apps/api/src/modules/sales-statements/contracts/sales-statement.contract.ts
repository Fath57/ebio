import { z } from 'zod'

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Longest span one statement covers: a year and a day, so « 1 Jan → 1 Jan » passes. */
export const MAX_STATEMENT_DAYS = 367

export const salesStatementPeriodSchema = z.object({
  from: z.string().regex(DAY, 'Date attendue au format AAAA-MM-JJ'),
  to: z.string().regex(DAY, 'Date attendue au format AAAA-MM-JJ'),
}).meta({
  title: 'Sales Statement Period',
  description: 'Calendar days, both included, read in the shop\'s own time zone',
  examples: [{ from: '2026-11-01', to: '2026-11-30' }],
})

export type SalesStatementPeriod = z.infer<typeof salesStatementPeriodSchema>

// Order and length of the span are checked by the service, which answers in French.
export const sendSalesStatementSchema = salesStatementPeriodSchema.extend({
  /** Defaults to the shop owner's account address. */
  email: z.email('Adresse e-mail invalide').optional(),
}).meta({
  title: 'Send Sales Statement',
  description: 'Sends the Excel statement of the period as an e-mail attachment',
  examples: [{ from: '2026-11-01', to: '2026-11-30', email: 'comptable@example.com' }],
})

export type SendSalesStatementInput = z.infer<typeof sendSalesStatementSchema>

export const salesStatementLinkSchema = z.object({
  url: z.string(),
  expiresAt: z.string(),
}).meta({
  title: 'Sales Statement Link',
  description: 'Short-lived download link, opened by the phone\'s browser',
})

export type SalesStatementLink = z.infer<typeof salesStatementLinkSchema>
