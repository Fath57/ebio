import { describe, expect, it } from 'vitest'
import { returnStock } from './order-stock'

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
