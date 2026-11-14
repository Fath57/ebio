/**
 * How many items a price buys, so that a pack can be compared with the unit.
 *
 * A product may itself be sold by the pack (« PACK_DE_6 »): dividing a
 * « Pack de 12 » price by 12 then gave the price of one pack of six, set
 * against the price of the pack of six, and a −84 % that never existed.
 * Every format is brought back to the single item instead.
 */

const UNIT_PACK = /^PACK_DE_(\d+)$/i
const LABEL_PACK = /\bpack\s+de\s+(\d+)\b/i

/** Items in one unit of sale: six for « PACK_DE_6 », one for a kilo or a bottle. */
export function itemsInUnit(unitCode: string): number {
  const match = UNIT_PACK.exec(unitCode.trim())
  const count = match ? Number.parseInt(match[1], 10) : 1
  return Number.isInteger(count) && count >= 2 ? count : 1
}

/**
 * Items in a pack format. The label the buyer reads wins (« Pack de 12 » is
 * twelve items whatever the product's unit); without a count in it, the pack
 * holds `packSize` units of sale.
 */
export function itemsInFormat(format: { label: string, packSize: number | null }, itemsPerUnit: number): number {
  const match = LABEL_PACK.exec(format.label)
  const stated = match ? Number.parseInt(match[1], 10) : 0
  if (Number.isInteger(stated) && stated >= 2)
    return stated
  return (format.packSize ?? 1) * itemsPerUnit
}

/** Price of one item, or null when the price already is one item's. */
export function pricePerItem(price: number, items: number): number | null {
  return items > 1 ? price / items : null
}

/**
 * Saving of a pack against buying the same items at the unit price, in
 * whole percent; 0 when the pack is not cheaper.
 */
export function packSaving(packPerItem: number | null, unitPerItem: number): number {
  if (packPerItem === null || unitPerItem <= 0)
    return 0
  return Math.max(0, Math.round((1 - packPerItem / unitPerItem) * 100))
}
