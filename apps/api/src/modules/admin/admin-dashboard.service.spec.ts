import { describe, expect, it } from 'vitest'
import { parseDashboardPeriod, rollingDays } from './admin-dashboard.service'

describe('parseDashboardPeriod', () => {
  it('keeps a known period', () => {
    expect(parseDashboardPeriod('7d')).toBe('7d')
    expect(parseDashboardPeriod('month')).toBe('month')
  })

  it('falls back to the last 30 days', () => {
    expect(parseDashboardPeriod()).toBe('30d')
    expect(parseDashboardPeriod('')).toBe('30d')
    expect(parseDashboardPeriod('year')).toBe('30d')
  })
})

describe('rollingDays', () => {
  it('counts today in a rolling period', () => {
    expect(rollingDays('7d')).toBe(7)
    expect(rollingDays('30d')).toBe(30)
    expect(rollingDays('90d')).toBe(90)
  })

  it('has no fixed length for the calendar month', () => {
    expect(rollingDays('month')).toBeNull()
  })
})
