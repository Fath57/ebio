import { describe, expect, it } from 'vitest'
import { computePickupClockStart, computePickupDeadlines, computeWindowDispatchAt, formatDeliveryWindow, parseDeliverySlot } from './delivery-window'

// 09:25 in Cotonou (UTC+1) on 2026-11-09 — the order that showed the bug.
const placedAt = new Date('2026-11-09T08:25:56Z')

describe('parseDeliverySlot', () => {
  it('reads the slot the app writes', () => {
    const actual = parseDeliverySlot('Aujourd\'hui entre 14h00 et 16h00', placedAt)
    expect(actual?.start.toISOString()).toBe('2026-11-09T13:00:00.000Z')
    expect(actual?.end.toISOString()).toBe('2026-11-09T15:00:00.000Z')
  })

  it('reads tomorrow, hours without minutes and a typographic apostrophe', () => {
    const actual = parseDeliverySlot('Demain matin entre 8h et 12h', placedAt)
    expect(actual?.start.toISOString()).toBe('2026-11-10T07:00:00.000Z')
    expect(actual?.end.toISOString()).toBe('2026-11-10T11:00:00.000Z')
    expect(parseDeliverySlot('Aujourd’hui entre 14h et 16h', placedAt)?.start.toISOString()).toBe('2026-11-09T13:00:00.000Z')
  })

  it('gives a single hour a two-hour window', () => {
    const actual = parseDeliverySlot('vers 17h30', placedAt)
    expect(actual?.start.toISOString()).toBe('2026-11-09T16:30:00.000Z')
    expect(actual?.end.toISOString()).toBe('2026-11-09T18:30:00.000Z')
  })

  it('moves a past window without a named day to tomorrow', () => {
    const actual = parseDeliverySlot('entre 7h et 8h', placedAt)
    expect(actual?.start.toISOString()).toBe('2026-11-10T06:00:00.000Z')
  })

  it('refuses what it cannot read rather than guess', () => {
    expect(parseDeliverySlot('Tout de suite', placedAt)).toBeNull()
    expect(parseDeliverySlot('Reg and you can tftt je vais bien', placedAt)).toBeNull()
    expect(parseDeliverySlot('entre 16h et 14h', placedAt)).toBeNull()
    expect(parseDeliverySlot('à 25h', placedAt)).toBeNull()
    expect(parseDeliverySlot('', placedAt)).toBeNull()
    expect(parseDeliverySlot(null, placedAt)).toBeNull()
  })
})

describe('formatDeliveryWindow', () => {
  it('writes the window as the app does', () => {
    const window = { start: new Date('2026-11-09T13:00:00Z'), end: new Date('2026-11-09T15:00:00Z') }
    expect(formatDeliveryWindow(window, placedAt)).toBe('Aujourd\'hui entre 14h00 et 16h00')
    const later = { start: new Date('2026-11-12T07:00:00Z'), end: new Date('2026-11-12T09:00:00Z') }
    expect(formatDeliveryWindow(later, placedAt)).toBe('Le 12/11 entre 8h00 et 10h00')
  })
})

describe('pickup deadlines', () => {
  const acceptedAt = new Date('2026-11-09T08:49:22Z')
  const readyAt = new Date('2026-11-09T08:37:51Z')

  it('counts from acceptance when the parcel is already ready', () => {
    const actual = computePickupDeadlines({ acceptedAt, readyAt, windowStart: null, timeoutMinutes: 25, warningMinutes: 10 })
    expect(actual.releaseAt.toISOString()).toBe('2026-11-09T09:14:22.000Z')
    expect(actual.warnAt.toISOString()).toBe('2026-11-09T09:04:22.000Z')
  })

  it('counts from readiness when the courier accepted before it', () => {
    const lateReady = new Date('2026-11-09T09:30:00Z')
    expect(computePickupClockStart({ acceptedAt, readyAt: lateReady, windowStart: null }).toISOString()).toBe('2026-11-09T09:30:00.000Z')
  })

  it('waits for the buyer window: no release before the afternoon slot', () => {
    const windowStart = new Date('2026-11-09T13:00:00Z')
    const actual = computePickupDeadlines({ acceptedAt, readyAt, windowStart, timeoutMinutes: 25, warningMinutes: 10 })
    expect(actual.releaseAt.toISOString()).toBe('2026-11-09T12:55:00.000Z')
  })

  it('opens the search an hour before the window', () => {
    expect(computeWindowDispatchAt(new Date('2026-11-09T13:00:00Z'))?.toISOString()).toBe('2026-11-09T12:00:00.000Z')
    expect(computeWindowDispatchAt(null)).toBeNull()
  })
})
