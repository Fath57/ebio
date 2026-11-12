/** FCFA with French grouping and non-breaking spaces, so an amount never wraps. */
export function formatAmount(value: number): string {
  return `${value.toLocaleString('fr-FR').replace(/\u202F/g, '\u00A0')}\u00A0FCFA`
}

/** Ledger amounts carry their sign, so a credit reads as a credit. */
export function formatSignedAmount(value: number): string {
  return `${value > 0 ? '+' : ''}${formatAmount(value)}`
}
