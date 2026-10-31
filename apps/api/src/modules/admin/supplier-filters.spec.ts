import { describe, expect, it } from 'vitest'
import { buildSupplierConditions, readDay, readMinimum } from './supplier-filters'

describe('buildSupplierConditions', () => {
  it('binds every value, never inlines it', () => {
    const { conditions, values } = buildSupplierConditions({ q: 'ferme', minOrders: 3, minBalance: 5000 })
    expect(conditions.join(' ')).not.toContain('ferme')
    expect(values).toEqual(['%ferme%', '%ferme%', '%ferme%', '%ferme%', '%ferme%', 3, 5000])
  })

  it('reads a zero as a filter, not as no filter', () => {
    const { conditions, values } = buildSupplierConditions({ minOrders: 0 })
    expect(conditions).toContain('COALESCE(os.order_count, 0) >= ?')
    expect(values).toEqual([0])
  })

  it('filters on location and negotiated rate without values', () => {
    const { conditions, values } = buildSupplierConditions({ located: 'no', negotiatedRate: 'yes' })
    expect(conditions).toContain('s.location IS NULL')
    expect(conditions).toContain('s.commission_rate IS NOT NULL')
    expect(values).toEqual([])
  })
})

describe('query readers', () => {
  it('reads minimums', () => {
    expect(readMinimum('3')).toBe(3)
    expect(readMinimum('')).toBeUndefined()
    expect(readMinimum('-1')).toBeUndefined()
    expect(readMinimum('abc')).toBeUndefined()
  })

  it('reads days, the end one exclusive', () => {
    expect(readDay('2026-10-01')?.toISOString()).toBe('2026-10-01T00:00:00.000Z')
    expect(readDay('2026-10-31', true)?.toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(readDay('31/10/2026')).toBeUndefined()
  })
})
