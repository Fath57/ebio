import { describe, expect, it } from 'vitest'
import { supplierShare } from './supplier-share'

const base = {
  paymentAmount: 10_000,
  commissionAmount: 1_000,
  deliveryFee: 1_500,
  deliveredByCourier: false,
  discountFundedBy: null,
  discountAmount: 0,
  platformPromoCompensation: 0,
}

describe('supplierShare', () => {
  it('garde les frais de livraison quand la boutique a livré elle-même', () => {
    expect(supplierShare(base)).toEqual({ sale: 9_000, compensation: 0, total: 9_000 })
  })

  it('retire les frais de livraison quand un livreur eBio a livré', () => {
    expect(supplierShare({ ...base, deliveredByCourier: true }).sale).toBe(7_500)
  })

  it('ajoute la compensation des promotions payées par eBio', () => {
    const share = supplierShare({ ...base, discountFundedBy: 'PLATFORM', discountAmount: 500, platformPromoCompensation: 300 })
    expect(share.compensation).toBe(800)
    expect(share.total).toBe(9_800)
  })

  it('ne compense pas un code promo financé par la boutique', () => {
    expect(supplierShare({ ...base, discountFundedBy: 'SUPPLIER', discountAmount: 500 }).compensation).toBe(0)
  })

  it('ne descend jamais sous zéro', () => {
    expect(supplierShare({ ...base, paymentAmount: 500 }).sale).toBe(0)
  })
})
