/** The slice of an order line stock depends on: entity or test double alike. */
interface StockLine {
  quantity: number
  product: { stock: number }
  variant?: { stock: number } | null
}

/**
 * Puts back what `accept()` took for each line: the variant's stock when the
 * line has one, the product's otherwise — the same split as the decrement.
 *
 * Only an accepted order took anything, so the caller decides on
 * `acceptedAt`; this function just reverses the lines it is given.
 */
export function returnStock(lines: Iterable<StockLine>): void {
  for (const line of lines) {
    if (line.variant) {
      line.variant.stock += line.quantity
    }
    else {
      line.product.stock += line.quantity
    }
  }
}
