import type { OrderDeliverySummary } from './contracts/order.contract'
import type { Order } from './entities/order.entity'
import { describe, expect, it } from 'vitest'
import { OrderStatus, PickupMode } from './entities/order.entity'
import { OrderMapper } from './orders.mapper'

function orderOf(fields: Partial<Order>): Order {
  return {
    status: OrderStatus.ACCEPTED,
    pickupMode: PickupMode.ON_SITE,
    totalAmount: 9_200,
    commissionAmount: 368,
    deliveryFee: 0,
    discountAmount: 0,
    discountFundedBy: null,
    platformPromoCompensation: 0,
    ...fields,
  } as Order
}

function deliveredBy(courierName: string | null): OrderDeliverySummary {
  return { status: 'DELIVERED', courierName, courierVehicleType: null, run: null, updatedAt: new Date().toISOString() }
}

describe('part de la boutique sur une commande', () => {
  it('retire la commission du total payé (retrait ou export)', () => {
    expect(OrderMapper.supplierPayoutOf(orderOf({}), null)).toEqual({ commission: 368, courierFee: 0, compensation: 0, total: 8_832 })
    expect(OrderMapper.supplierPayoutOf(orderOf({ pickupMode: PickupMode.EXPORT }), null).total).toBe(8_832)
  })

  it('laisse les frais de livraison au livreur avant la livraison', () => {
    const order = orderOf({ pickupMode: PickupMode.DELIVERY, totalAmount: 9_700, deliveryFee: 500 })
    expect(OrderMapper.supplierPayoutOf(order, null)).toEqual({ commission: 368, courierFee: 500, compensation: 0, total: 8_832 })
  })

  it('rend les frais à la boutique qui a livré elle-même', () => {
    const order = orderOf({ status: OrderStatus.DELIVERED, pickupMode: PickupMode.DELIVERY, totalAmount: 9_700, deliveryFee: 500 })
    expect(OrderMapper.supplierPayoutOf(order, deliveredBy(null)).total).toBe(9_332)
    expect(OrderMapper.supplierPayoutOf(order, deliveredBy('Koffi')).total).toBe(8_832)
  })

  it('ajoute ce que eBio rembourse de ses promotions', () => {
    const order = orderOf({ totalAmount: 8_200, discountAmount: 1_000, discountFundedBy: 'PLATFORM', platformPromoCompensation: 300 })
    expect(OrderMapper.supplierPayoutOf(order, null)).toEqual({ commission: 368, courierFee: 0, compensation: 1_300, total: 9_132 })
  })

  it('ne donne la part qu’à la boutique', () => {
    const order = orderOf({ buyer: { id: 'b', name: 'A' }, supplier: { id: 's', shopName: 'S' }, items: { isInitialized: () => false }, createdAt: new Date(), updatedAt: new Date() } as unknown as Partial<Order>)
    expect(OrderMapper.toResponse(order).supplierPayout).toBeNull()
    expect(OrderMapper.toResponse(order, null, {}, { supplierView: true }).supplierPayout?.total).toBe(8_832)
  })
})
