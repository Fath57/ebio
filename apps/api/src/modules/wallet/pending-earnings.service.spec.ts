import { describe, expect, it, vi } from 'vitest'
import { OrderStatus, PickupMode } from '../orders/entities/order.entity'
import { PendingEarningsService } from './pending-earnings.service'

const now = new Date('2026-10-04T12:00:00Z')

function order(overrides: Record<string, unknown>) {
  return {
    id: 'order',
    status: OrderStatus.DELIVERED,
    pickupMode: PickupMode.DELIVERY,
    commissionAmount: 1_000,
    deliveryFee: 500,
    discountFundedBy: null,
    discountAmount: 0,
    platformPromoCompensation: 0,
    deliveryConfirmedByBuyer: false,
    deliveryConfirmedBySupplier: false,
    deliveredAt: new Date('2026-10-03T12:00:00Z'),
    ...overrides,
  }
}

function build(payments: unknown[], courierDeliveredOrderIds: string[]) {
  const em = {
    find: vi.fn()
      .mockResolvedValueOnce(payments)
      .mockResolvedValueOnce(courierDeliveredOrderIds.map(id => ({ order: { id } }))),
  }
  const settings = { getEscrowRelease: vi.fn().mockResolvedValue({ heuresApresConfirmation: 48, joursMaximum: 7 }) }
  return new PendingEarningsService(em as never, settings as never)
}

describe('montant en attente de crédit', () => {
  it('sépare les commandes livrées de celles en cours, avec la part réelle de la boutique', async () => {
    const service = build([
      // Delivered by an eBio courier: the fee is not the shop's.
      { amount: 10_500, order: order({ id: 'a' }) },
      // Still being prepared, delivery mode: counted as a courier delivery.
      { amount: 5_500, order: order({ id: 'b', status: OrderStatus.PREPARING, deliveredAt: undefined }) },
    ], ['a'])

    const pending = await service.forSupplier('shop', now)

    expect(pending.deliveredAmount).toBe(9_000)
    expect(pending.inProgressAmount).toBe(4_000)
    expect(pending.amount).toBe(13_000)
    expect(pending.deliveredCount).toBe(1)
    expect(pending.inProgressCount).toBe(1)
  })

  it('annonce le versement au délai maximum sans double confirmation', async () => {
    const service = build([{ amount: 10_500, order: order({ id: 'a' }) }], ['a'])

    const pending = await service.forSupplier('shop', now)

    expect(pending.nextReleaseAt).toBe('2026-10-10T12:00:00.000Z')
  })

  it('annonce le versement après le délai court quand les deux ont confirmé', async () => {
    const service = build([{
      amount: 10_500,
      order: order({ id: 'a', deliveryConfirmedByBuyer: true, deliveryConfirmedBySupplier: true }),
    }], ['a'])

    const pending = await service.forSupplier('shop', now)

    expect(pending.nextReleaseAt).toBe('2026-10-05T12:00:00.000Z')
  })

  it('ne promet jamais un moment déjà passé', async () => {
    const service = build([{
      amount: 10_500,
      order: order({ id: 'a', deliveredAt: new Date('2026-09-01T00:00:00Z') }),
    }], ['a'])

    const pending = await service.forSupplier('shop', now)

    expect(pending.nextReleaseAt).toBe(now.toISOString())
  })
})
