import { BadRequestException, ConflictException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WalletTransactionType } from '../wallet/entities/wallet-transaction.entity'
import { BannerRequestStatus } from './banner-request.entity'
import { BannerRequestsService } from './banner-requests.service'

interface TestRequest {
  id: string
  supplier: { id: string, shopName: string, user: { id: string } }
  title: string
  subtitle: string | null
  imageUrl: string
  targetType: 'SUPPLIER' | 'PRODUCT'
  targetId: string | null
  durationDays: number
  price: number
  requestedStartAt: Date | null
  status: BannerRequestStatus
  rejectionReason: string | null
  banner: Record<string, unknown> | null
  paidAt: Date | null
  refundedAt: Date | null
  reviewedBy: string | null
  reviewedAt: Date | null
  createdAt: Date
}

const supplier = { id: 'shop-1', shopName: 'Le Panier', user: { id: 'user-shop' } }

function buildRequest(extra: Partial<TestRequest> = {}): TestRequest {
  return {
    id: 'req-1',
    supplier,
    title: 'Huile en promo',
    subtitle: null,
    imageUrl: 'https://cdn.example.com/b.jpg',
    targetType: 'SUPPLIER',
    targetId: 'shop-1',
    durationDays: 7,
    price: 5000,
    requestedStartAt: null,
    status: BannerRequestStatus.PENDING,
    rejectionReason: null,
    banner: null,
    paidAt: new Date('2026-09-11T08:00:00Z'),
    refundedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date('2026-09-11T08:00:00Z'),
    ...extra,
  }
}

function buildService(request: TestRequest | null, options: { pendingCount?: number, insufficient?: boolean } = {}) {
  const created: Array<{ entity: string, data: Record<string, unknown> }> = []
  const em = {
    findOne: vi.fn(async (entity: { name: string }) => {
      if (entity.name === 'BannerRequest')
        return request
      if (entity.name === 'Supplier')
        return supplier
      if (entity.name === 'Product')
        return { id: 'prod-1', name: 'Huile' }
      return null
    }),
    findOneOrFail: vi.fn(async (entity: { name: string }, where: { id: string }) => entity.name === 'Supplier' ? supplier : { id: where.id }),
    find: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(options.pendingCount ?? 0),
    create: vi.fn((entity: { name: string }, data: Record<string, unknown>) => {
      const row = { id: `${entity.name.toLowerCase()}-new`, ...data, createdAt: new Date('2026-09-11T08:00:00Z') }
      created.push({ entity: entity.name, data: row })
      return row
    }),
    nativeDelete: vi.fn(),
    flush: vi.fn(),
  }
  const walletService = {
    getOrCreate: vi.fn().mockResolvedValue({ id: 'wallet-shop' }),
    debit: vi.fn(async () => {
      if (options.insufficient)
        throw new BadRequestException('Solde insuffisant')
      return 1000
    }),
    credit: vi.fn().mockResolvedValue(6000),
  }
  const settings = { getBannerOffers: vi.fn().mockResolvedValue({ offers: [{ days: 7, price: 5000 }, { days: 30, price: 15000 }], paidSlots: 3 }) }
  const notifications = { send: vi.fn().mockResolvedValue(undefined) }
  const staffInbox = { notifyNewBannerRequest: vi.fn().mockResolvedValue(undefined) }
  const service = new BannerRequestsService(em as never, walletService as never, settings as never, notifications as never, staffInbox as never)
  return { service, em, walletService, notifications, created }
}

const input = { title: 'Huile en promo', imageUrl: 'https://cdn.example.com/b.jpg', targetType: 'SUPPLIER' as const, durationDays: 7 }

describe('create', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('snapshots the offer price and debits the shop wallet at once', async () => {
    const { service, walletService, created } = buildService(buildRequest())
    await service.create('shop-1', input)
    expect(created[0].data).toMatchObject({ durationDays: 7, price: 5000, targetId: 'shop-1' })
    expect(walletService.debit).toHaveBeenCalledWith('wallet-shop', expect.objectContaining({ type: WalletTransactionType.BANNER_PAYMENT, amount: 5000 }))
  })

  it('refuses a duration outside the offers', async () => {
    const { service, walletService } = buildService(buildRequest())
    await expect(service.create('shop-1', { ...input, durationDays: 10 })).rejects.toBeInstanceOf(BadRequestException)
    expect(walletService.debit).not.toHaveBeenCalled()
  })

  it('drops the request when the wallet cannot pay', async () => {
    const { service, em } = buildService(buildRequest(), { insufficient: true })
    await expect(service.create('shop-1', input)).rejects.toBeInstanceOf(BadRequestException)
    expect(em.nativeDelete).toHaveBeenCalled()
  })

  it('caps pending requests at three per shop', async () => {
    const { service, walletService } = buildService(buildRequest(), { pendingCount: 3 })
    await expect(service.create('shop-1', input)).rejects.toBeInstanceOf(ConflictException)
    expect(walletService.debit).not.toHaveBeenCalled()
  })
})

describe('review', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('approve publishes a sponsored banner for the paid duration', async () => {
    const request = buildRequest()
    const { service, created, notifications } = buildService(request)
    await service.approve('req-1', 'admin-1', {})
    const banner = created.find(c => c.entity === 'Banner')!.data as { sponsored: boolean, startsAt: Date, endsAt: Date }
    expect(banner.sponsored).toBe(true)
    expect(banner.endsAt.getTime() - banner.startsAt.getTime()).toBe(7 * 86_400_000)
    expect(request.status).toBe(BannerRequestStatus.APPROVED)
    expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'BANNER_APPROVED' }))
  })

  it('approve honours a future requested start', async () => {
    const future = new Date(Date.now() + 3 * 86_400_000)
    const { service, created } = buildService(buildRequest({ requestedStartAt: future }))
    await service.approve('req-1', 'admin-1', {})
    const banner = created.find(c => c.entity === 'Banner')!.data as { startsAt: Date }
    expect(banner.startsAt).toEqual(future)
  })

  it('reject refunds the full price once', async () => {
    const request = buildRequest()
    const { service, walletService } = buildService(request)
    await service.reject('req-1', 'admin-1', { reason: 'Image floue, merci de renvoyer un visuel net' })
    expect(walletService.credit).toHaveBeenCalledWith('wallet-shop', expect.objectContaining({ type: WalletTransactionType.BANNER_REFUND, amount: 5000 }))
    expect(request.refundedAt).not.toBeNull()
    await expect(service.reject('req-1', 'admin-1', { reason: 'Encore une fois' })).rejects.toBeInstanceOf(ConflictException)
  })

  it('cancel is for the owner and only while pending', async () => {
    const { service, walletService } = buildService(buildRequest({ status: BannerRequestStatus.APPROVED }))
    await expect(service.cancel('shop-1', 'req-1')).rejects.toBeInstanceOf(ConflictException)
    expect(walletService.credit).not.toHaveBeenCalled()

    const pending = buildService(buildRequest())
    await pending.service.cancel('shop-1', 'req-1')
    expect(pending.walletService.credit).toHaveBeenCalledWith('wallet-shop', expect.objectContaining({ type: WalletTransactionType.BANNER_REFUND }))
  })
})
