import { describe, expect, it } from 'vitest'
import { computeCourierFee, computeDeliveryFee } from './delivery-fee'

describe('computeDeliveryFee', () => {
  const shop = { deliveryFee: 1000, freeDeliveryFrom: 10_000 }

  it('charges the flat fee on a delivery below the waiver', () => {
    expect(computeDeliveryFee(shop, true, 9999)).toBe(1000)
  })

  it('charges nothing on a pickup, however small the basket', () => {
    expect(computeDeliveryFee(shop, false, 500)).toBe(0)
  })

  it('waives the fee once the items reach the threshold', () => {
    expect(computeDeliveryFee(shop, true, 10_000)).toBe(0)
    expect(computeDeliveryFee(shop, true, 25_000)).toBe(0)
  })

  it('keeps charging when no threshold is set', () => {
    expect(computeDeliveryFee({ deliveryFee: 1000 }, true, 999_999)).toBe(0 + 1000)
    expect(computeDeliveryFee({ deliveryFee: 1000, freeDeliveryFrom: null }, true, 999_999)).toBe(1000)
  })

  it('charges nothing when the shop set no fee', () => {
    expect(computeDeliveryFee({}, true, 5000)).toBe(0)
    expect(computeDeliveryFee({ deliveryFee: 0 }, true, 5000)).toBe(0)
    expect(computeDeliveryFee({ deliveryFee: null }, true, 5000)).toBe(0)
  })

  it('never lets the fee fund its own waiver', () => {
    // Items at 9 500 with a 1 000 fee would reach 10 500 — above the threshold.
    // The waiver must look at the items alone, so the fee stays due.
    expect(computeDeliveryFee(shop, true, 9500)).toBe(1000)
  })

  it('ignores a negative fee rather than crediting the buyer', () => {
    expect(computeDeliveryFee({ deliveryFee: -500 }, true, 5000)).toBe(0)
  })
})

describe('computeCourierFee', () => {
  it('leaves the courier the fee minus the platform cut', () => {
    expect(computeCourierFee(1000, 0.1)).toBe(900)
    expect(computeCourierFee(1500, 0.1)).toBe(1350)
  })

  it('rounds to the FCFA', () => {
    expect(computeCourierFee(1234, 0.1)).toBe(1111)
    expect(computeCourierFee(1234, 0.15)).toBe(1049)
  })

  it('hands the whole fee over at a zero rate', () => {
    expect(computeCourierFee(1000, 0)).toBe(1000)
  })

  it('pays nothing when delivery was free', () => {
    expect(computeCourierFee(0, 0.1)).toBe(0)
    expect(computeCourierFee(-500, 0.1)).toBe(0)
  })

  it('clamps an out-of-range rate instead of going negative', () => {
    expect(computeCourierFee(1000, 1.5)).toBe(0)
    expect(computeCourierFee(1000, -0.2)).toBe(1000)
  })
})
