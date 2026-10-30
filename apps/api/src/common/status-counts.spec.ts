import { describe, expect, it } from 'vitest'
import { toStatusCounts } from './status-counts'

describe('toStatusCounts', () => {
  it('reads the bigint counts Postgres sends as strings', () => {
    expect(toStatusCounts([
      { status: 'PLACED', count: '4' },
      { status: 'DELIVERED', count: '12' },
    ])).toEqual({ PLACED: 4, DELIVERED: 12 })
  })

  it('leaves out statuses with no row', () => {
    expect(toStatusCounts([])).toEqual({})
  })

  it('ignores rows without a status', () => {
    expect(toStatusCounts([
      { status: null, count: '3' },
      { status: '', count: '1' },
      { status: 'PENDING', count: 2 },
    ])).toEqual({ PENDING: 2 })
  })
})
