import { describe, expect, it } from 'vitest'
import { buildProductConditions } from './product-filters'

describe('buildProductConditions', () => {
  it('binds the values of a price range and a sales minimum', () => {
    const { conditions, values } = buildProductConditions({ minPrice: 500, maxPrice: 2000, minSold: 10 })
    expect(conditions).toEqual(['p.price_per_unit >= ?', 'p.price_per_unit <= ?', 'sales.units_sold >= ?'])
    expect(values).toEqual([500, 2000, 10])
  })

  it('looks a label up in the jsonb array, bound', () => {
    const { conditions, values } = buildProductConditions({ label: 'organic' })
    expect(conditions).toEqual(['jsonb_exists(p.labels, ?)'])
    expect(values).toEqual(['organic'])
  })

  it('adds nothing without filters', () => {
    expect(buildProductConditions({})).toEqual({ conditions: [], values: [] })
  })
})
