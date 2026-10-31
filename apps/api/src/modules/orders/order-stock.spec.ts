import { describe, expect, it } from 'vitest'
import { availableQuantity, returnStock, stockDraw, takeStock } from './order-stock'

describe('returnStock', () => {
  it('gives the quantity back to the product of a plain line', () => {
    const product = { stock: 3 }
    returnStock([{ quantity: 2, product, variant: null }])
    expect(product.stock).toBe(5)
  })

  it('gives it back to the variant, not the product, when the line has one', () => {
    const product = { stock: 10 }
    const variant = { stock: 1 }
    returnStock([{ quantity: 4, product, variant }])
    expect(variant.stock).toBe(5)
    expect(product.stock).toBe(10)
  })

  it('adds up several lines of the same product', () => {
    const product = { stock: 0 }
    returnStock([
      { quantity: 1, product },
      { quantity: 2, product },
    ])
    expect(product.stock).toBe(3)
  })
})

describe('packs', () => {
  it('a pack draws its units from the product', () => {
    const product = { stock: 20 }
    const pack = { stock: 0, packSize: 6 }
    expect(stockDraw({ quantity: 2, product, variant: pack })).toEqual({ holder: product, units: 12 })
  })

  it('returns a pack to the product, unit by unit', () => {
    const product = { stock: 2 }
    returnStock([{ quantity: 1, product, variant: { stock: 0, packSize: 12 } }])
    expect(product.stock).toBe(14)
  })

  it('counts whole packs only', () => {
    expect(availableQuantity(13, { stock: 0, packSize: 6 })).toBe(2)
    expect(availableQuantity(13, { stock: 4, packSize: null })).toBe(4)
    expect(availableQuantity(13)).toBe(13)
  })
})

describe('takeStock', () => {
  const name = (line: { quantity: number }) => `line ${line.quantity}`

  it('adds the unit and the pack of one product before checking', () => {
    const product = { stock: 10 }
    const lines = [
      { quantity: 5, product, variant: null },
      { quantity: 1, product, variant: { stock: 0, packSize: 6 } },
    ]
    expect(takeStock(lines, name)).toBe('line 5')
    expect(product.stock).toBe(10)
  })

  it('takes everything when it all fits', () => {
    const product = { stock: 12 }
    const lines = [
      { quantity: 6, product, variant: null },
      { quantity: 1, product, variant: { stock: 0, packSize: 6 } },
    ]
    expect(takeStock(lines, name)).toBeNull()
    expect(product.stock).toBe(0)
  })
})
