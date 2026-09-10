import { describe, expect, it } from 'vitest'
import { computeCourierFee, computeDeliveryFee, DEFAULT_DELIVERY_PRICING } from './delivery-fee'

const base = { isDelivery: true, itemsTotal: 5_000, hasShopPosition: true }

describe('computeDeliveryFee', () => {
  it('charges nothing on a pickup or above the free threshold', () => {
    expect(computeDeliveryFee(DEFAULT_DELIVERY_PRICING, { ...base, isDelivery: false, distanceKm: 4 }).fee).toBe(0)
    const withThreshold = { ...DEFAULT_DELIVERY_PRICING, freeFrom: 20_000 }
    expect(computeDeliveryFee(withThreshold, { ...base, itemsTotal: 20_000, distanceKm: 4 })).toMatchObject({ fee: 0, reason: 'FREE_THRESHOLD' })
    expect(computeDeliveryFee(withThreshold, { ...base, itemsTotal: 19_999, distanceKm: 4 }).fee).toBe(700)
  })

  it('prices by distance, rounded up to the step and clamped', () => {
    expect(computeDeliveryFee(DEFAULT_DELIVERY_PRICING, { ...base, distanceKm: 4.2 })).toMatchObject({ fee: 800, reason: 'DISTANCE' })
    expect(computeDeliveryFee(DEFAULT_DELIVERY_PRICING, { ...base, distanceKm: 0.1 }).fee).toBe(400)
    expect(computeDeliveryFee({ ...DEFAULT_DELIVERY_PRICING, distance: { ...DEFAULT_DELIVERY_PRICING.distance, minFee: 500 } }, { ...base, distanceKm: 0.1 }).fee).toBe(500)
    expect(computeDeliveryFee(DEFAULT_DELIVERY_PRICING, { ...base, distanceKm: 24 }).fee).toBe(2500)
  })

  it('needs a drop-off point in distance mode and refuses beyond the limit', () => {
    expect(computeDeliveryFee(DEFAULT_DELIVERY_PRICING, { ...base, distanceKm: null })).toMatchObject({ fee: null, reason: 'NO_POSITION' })
    expect(computeDeliveryFee(DEFAULT_DELIVERY_PRICING, { ...base, distanceKm: 25.5 })).toMatchObject({ fee: null, reason: 'OUT_OF_RANGE' })
    // A shop without a position gets the flat fee rather than blocking sales.
    expect(computeDeliveryFee(DEFAULT_DELIVERY_PRICING, { ...base, hasShopPosition: false, distanceKm: null })).toMatchObject({ fee: 500, reason: 'NO_SHOP_POSITION' })
  })

  it('applies the flat mode whatever the distance', () => {
    const flat = { ...DEFAULT_DELIVERY_PRICING, mode: 'FLAT' as const }
    expect(computeDeliveryFee(flat, { ...base, distanceKm: null })).toMatchObject({ fee: 500, reason: 'FLAT' })
    expect(computeDeliveryFee(flat, { ...base, distanceKm: 40 }).fee).toBe(500)
  })

  it('picks the first ring containing the distance in zones mode', () => {
    const zones = { ...DEFAULT_DELIVERY_PRICING, mode: 'ZONES' as const }
    expect(computeDeliveryFee(zones, { ...base, distanceKm: 2.9 })).toMatchObject({ fee: 500, reason: 'ZONE' })
    expect(computeDeliveryFee(zones, { ...base, distanceKm: 3 }).fee).toBe(500)
    expect(computeDeliveryFee(zones, { ...base, distanceKm: 7 }).fee).toBe(1000)
    expect(computeDeliveryFee(zones, { ...base, distanceKm: 20 }).fee).toBe(1500)
    expect(computeDeliveryFee({ ...zones, maxDistanceKm: 50 }, { ...base, distanceKm: 30 })).toMatchObject({ fee: null, reason: 'OUT_OF_RANGE' })
  })
})

describe('computeCourierFee', () => {
  it('leaves the courier the fee minus the platform rate, rounded', () => {
    expect(computeCourierFee(1000, 0.1)).toBe(900)
    expect(computeCourierFee(0, 0.1)).toBe(0)
    expect(computeCourierFee(1000, 1.5)).toBe(0)
  })
})
