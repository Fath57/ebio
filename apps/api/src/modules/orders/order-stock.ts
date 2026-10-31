/** The slice of an order line stock depends on: entity or test double alike. */
interface StockLine {
  quantity: number
  product: { stock: number }
  variant?: { stock: number, packSize?: number | null } | null
}

/** Where a line's units come from, and how many it takes. */
export interface StockDraw {
  holder: { stock: number }
  units: number
}

/**
 * The one rule every stock movement follows:
 * - a pack (`packSize`) takes `quantity × packSize` units from the product —
 *   a « Pack de 6 » is six bottles off the same shelf;
 * - any other variant (size, flavour) has a stock of its own;
 * - a plain line takes from the product.
 */
export function stockDraw(line: StockLine): StockDraw {
  const packSize = line.variant?.packSize
  if (line.variant && packSize && packSize > 1)
    return { holder: line.product, units: line.quantity * packSize }
  if (line.variant)
    return { holder: line.variant, units: line.quantity }
  return { holder: line.product, units: line.quantity }
}

/**
 * How many of a format can still be sold: whole packs out of the product's
 * units, the variant's own stock otherwise.
 */
export function availableQuantity(productStock: number, variant?: { stock: number, packSize?: number | null } | null): number {
  if (variant?.packSize && variant.packSize > 1)
    return Math.floor(productStock / variant.packSize)
  return variant ? variant.stock : productStock
}

/**
 * Takes what each line needs, all or nothing: lines sharing a product (the
 * unit and a pack of it) are added up before anything moves.
 *
 * Returns the label of the first line that does not fit, null when all did.
 */
export function takeStock<T extends StockLine>(lines: Iterable<T>, describe: (line: T) => string): string | null {
  const draws = [...lines].map(line => ({ line, ...stockDraw(line) }))
  const needed = new Map<{ stock: number }, number>()
  for (const draw of draws)
    needed.set(draw.holder, (needed.get(draw.holder) ?? 0) + draw.units)
  for (const draw of draws) {
    if (draw.holder.stock < (needed.get(draw.holder) ?? 0))
      return describe(draw.line)
  }
  for (const draw of draws)
    draw.holder.stock -= draw.units
  return null
}

/**
 * Puts back what `accept()` took for each line, by the same rule.
 *
 * Only an accepted order took anything, so the caller decides on
 * `acceptedAt`; this function just reverses the lines it is given.
 */
export function returnStock(lines: Iterable<StockLine>): void {
  for (const line of lines) {
    const draw = stockDraw(line)
    draw.holder.stock += draw.units
  }
}
