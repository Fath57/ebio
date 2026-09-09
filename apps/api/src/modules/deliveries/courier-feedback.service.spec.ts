import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WalletTransactionType } from '../wallet/entities/wallet-transaction.entity'
import { CourierFeedbackService } from './courier-feedback.service'
import { DeliveryStatus } from './entities/delivery.entity'

interface TestDelivery {
  id: string
  status: DeliveryStatus
  tipAmount: number
  courier: { id: string, fullName: string, user: { id: string } } | null
  order: { id: string, orderNumber: string, buyer: { id: string } }
}

function buildDelivery(extra: Partial<TestDelivery> = {}): TestDelivery {
  return {
    id: 'delivery-1',
    status: DeliveryStatus.DELIVERED,
    tipAmount: 0,
    courier: { id: 'courier-1', fullName: 'Sètondji H.', user: { id: 'user-courier-1' } },
    order: { id: 'order-1', orderNumber: 'EB-20260909-001', buyer: { id: 'user-buyer' } },
    ...extra,
  }
}

interface Options {
  existingRating?: boolean
  existingTip?: boolean
  courierCreditFails?: boolean
}

function buildService(delivery: TestDelivery, options: Options = {}) {
  const execute = vi.fn().mockResolvedValue([])
  const created: Array<{ entity: string, data: Record<string, unknown> }> = []
  const em = {
    findOne: vi.fn(async (entity: { name: string }) => {
      if (entity.name === 'Delivery')
        return delivery
      if (entity.name === 'CourierRating')
        return options.existingRating ? { rating: 5 } : null
      if (entity.name === 'CourierTip')
        return options.existingTip ? { amount: 200 } : null
      return null
    }),
    findOneOrFail: vi.fn(async (_entity: unknown, where: { id: string }) => ({ id: where.id, name: 'Amina Koffi' })),
    create: vi.fn((entity: { name: string }, data: Record<string, unknown>) => {
      const row = { ...data, createdAt: new Date('2026-09-09T10:00:00Z') }
      created.push({ entity: entity.name, data: row })
      return row
    }),
    flush: vi.fn(),
    getConnection: () => ({ execute }),
  }
  const wallets = { debit: vi.fn().mockResolvedValue(2500), credit: vi.fn() }
  wallets.credit.mockImplementation(async (walletId: string) => {
    if (walletId === 'wallet-courier' && options.courierCreditFails)
      throw new Error('ledger down')
    return 10_000
  })
  const walletService = {
    getOrCreate: vi.fn(async (owner: { userId?: string, courierId?: string }) => ({ id: owner.courierId ? 'wallet-courier' : 'wallet-buyer' })),
    ...wallets,
  }
  const notifications = { send: vi.fn().mockResolvedValue(undefined) }
  const service = new CourierFeedbackService(em as never, walletService as never, notifications as never)
  return { service, em, execute, walletService, notifications, created }
}

describe('rate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stores the rating, refreshes the courier average and tells the courier', async () => {
    const delivery = buildDelivery()
    const { service, execute, created, notifications } = buildService(delivery)

    const rating = await service.rate(delivery.id, 'user-buyer', { rating: 4, comment: 'Rapide' })

    expect(rating.rating).toBe(4)
    expect(created[0].entity).toBe('CourierRating')
    expect(execute.mock.calls[0][0]).toContain('UPDATE courier_profiles')
    expect(execute.mock.calls[0][1]).toEqual(['courier-1', 'courier-1'])
    expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'COURIER_RATED', apps: ['courier'] }))
  })

  it('refuses a second rating on the same delivery', async () => {
    const delivery = buildDelivery()
    const { service, created } = buildService(delivery, { existingRating: true })

    await expect(service.rate(delivery.id, 'user-buyer', { rating: 5 })).rejects.toBeInstanceOf(ConflictException)
    expect(created).toHaveLength(0)
  })

  it('only lets the buyer of the order rate', async () => {
    const delivery = buildDelivery()
    const { service } = buildService(delivery)

    await expect(service.rate(delivery.id, 'someone-else', { rating: 5 })).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('waits for the run to be delivered by a courier', async () => {
    const { service } = buildService(buildDelivery({ status: DeliveryStatus.IN_TRANSIT }))
    await expect(service.rate('delivery-1', 'user-buyer', { rating: 5 })).rejects.toBeInstanceOf(BadRequestException)

    const selfDelivered = buildService(buildDelivery({ courier: null }))
    await expect(selfDelivered.service.rate('delivery-1', 'user-buyer', { rating: 5 })).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe('tip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('moves the amount from the buyer wallet to the courier wallet in full', async () => {
    const delivery = buildDelivery()
    const { service, walletService, created, notifications } = buildService(delivery)

    const result = await service.tip(delivery.id, 'user-buyer', { amount: 500 })

    expect(walletService.debit).toHaveBeenCalledWith('wallet-buyer', expect.objectContaining({ type: WalletTransactionType.TIP_PAYMENT, amount: 500, deliveryId: delivery.id }))
    expect(walletService.credit).toHaveBeenCalledWith('wallet-courier', expect.objectContaining({ type: WalletTransactionType.TIP_EARNING, amount: 500 }))
    expect(delivery.tipAmount).toBe(500)
    expect(created[0].entity).toBe('CourierTip')
    expect(result).toEqual({ amount: 500, walletBalance: 2500, createdAt: '2026-09-09T10:00:00.000Z' })
    expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'COURIER_TIP' }))
  })

  it('refunds the buyer when the courier credit fails', async () => {
    const delivery = buildDelivery()
    const { service, walletService, created } = buildService(delivery, { courierCreditFails: true })

    await expect(service.tip(delivery.id, 'user-buyer', { amount: 500 })).rejects.toBeInstanceOf(BadRequestException)

    const refund = walletService.credit.mock.calls.find(([walletId]) => walletId === 'wallet-buyer')
    expect(refund?.[1]).toEqual(expect.objectContaining({ type: WalletTransactionType.REFUND, amount: 500 }))
    expect(created).toHaveLength(0)
    expect(delivery.tipAmount).toBe(0)
  })

  it('accepts a single tip per delivery', async () => {
    const delivery = buildDelivery()
    const { service, walletService } = buildService(delivery, { existingTip: true })

    await expect(service.tip(delivery.id, 'user-buyer', { amount: 500 })).rejects.toBeInstanceOf(ConflictException)
    expect(walletService.debit).not.toHaveBeenCalled()
  })
})
