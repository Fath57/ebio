import { BadRequestException, ConflictException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ValidationStatus } from '../suppliers/supplier.entity'
import { AdminDeliveriesService } from './admin-deliveries.service'
import { DeliveryEventType } from './entities/delivery-event.entity'
import { DeliveryStatus } from './entities/delivery.entity'

interface TestCourier {
  id: string
  fullName: string
  validationStatus: ValidationStatus
  user: { id: string, email: string }
}

interface TestDelivery {
  id: string
  status: DeliveryStatus
  pickupAddress: string
  offeredAt: Date
  courier: TestCourier | null
  order: {
    id: string
    orderNumber: string
    buyer: { id: string, email: string }
    supplier: { id: string, shopName: string, user: { id: string, email: string } }
  }
}

function buildCourier(extra: Partial<TestCourier> = {}): TestCourier {
  return {
    id: 'courier-1',
    fullName: 'Sètondji H.',
    validationStatus: ValidationStatus.VALIDATED,
    user: { id: 'user-courier-1', email: 'c1@example.com' },
    ...extra,
  }
}

function buildDelivery(extra: Partial<TestDelivery> = {}): TestDelivery {
  return {
    id: 'delivery-1',
    status: DeliveryStatus.AWAITING_COURIER,
    pickupAddress: 'Marché Dantokpa',
    offeredAt: new Date('2026-09-09T08:00:00Z'),
    courier: null,
    order: {
      id: 'order-1',
      orderNumber: 'EB-20260909-001',
      buyer: { id: 'user-buyer', email: 'buyer@example.com' },
      supplier: { id: 'supplier-1', shopName: 'Huiles Bio Koffi', user: { id: 'user-supplier', email: 's@example.com' } },
    },
    ...extra,
  }
}

function buildService(delivery: TestDelivery, courier: TestCourier | null) {
  const execute = vi.fn().mockResolvedValue([{ id: delivery.id }])
  const created: Array<Record<string, unknown>> = []
  const em = {
    // Delivery reads (before and inside the transaction) and the courier read
    // are told apart by the entity class.
    findOne: vi.fn(async (entity: { name: string }) =>
      entity.name === 'CourierProfile' ? courier : delivery),
    create: vi.fn((_entity: unknown, data: Record<string, unknown>) => {
      created.push(data)
      return data
    }),
    flush: vi.fn(),
    getConnection: () => ({ execute }),
    getTransactionContext: () => undefined,
    // The forked manager is the same mock: assertions stay in one place.
    transactional: vi.fn(async (work: (em: unknown) => Promise<unknown>) => work(em)),
  }
  const notifications = { send: vi.fn().mockResolvedValue(undefined) }
  const dispatch = { broadcast: vi.fn().mockResolvedValue(1), cancelPendingOffer: vi.fn().mockResolvedValue(undefined) }
  const audit = { record: vi.fn().mockResolvedValue(undefined) }
  const service = new AdminDeliveriesService(em as never, notifications as never, dispatch as never, audit as never)
  return { service, em, execute, notifications, dispatch, created, audit }
}

describe('assign', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('assigns an unclaimed delivery and notifies courier, buyer and supplier', async () => {
    const delivery = buildDelivery()
    const courier = buildCourier()
    const { service, execute, notifications, created, audit } = buildService(delivery, courier)

    await service.assign(delivery.id, courier.id, 'admin-1', 'Client pressé')

    const [sql, params] = execute.mock.calls[0]
    expect(sql).toContain(`status IN ('AWAITING_COURIER', 'ACCEPTED')`)
    expect(params).toEqual([courier.id, 0, delivery.id])
    expect(created.map(e => e.type)).toEqual([DeliveryEventType.ASSIGNED_BY_ADMIN])
    expect(created[0].payload).toEqual({ courierId: courier.id, note: 'Client pressé' })

    const recipients = notifications.send.mock.calls.map(([opts]) => opts.user.id)
    expect(recipients).toEqual(['user-courier-1', 'user-buyer', 'user-supplier'])
    // The courier push must reach the courier app even though the type belongs to buyer/supplier audiences.
    expect(notifications.send.mock.calls[0][0].apps).toEqual(['courier'])
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELIVERY_ASSIGNED', targetId: delivery.id }))
  })

  it('reassigns an accepted delivery and warns the released courier', async () => {
    const previous = buildCourier({ id: 'courier-0', fullName: 'Amina K.', user: { id: 'user-courier-0', email: 'c0@example.com' } })
    const delivery = buildDelivery({ status: DeliveryStatus.ACCEPTED, courier: previous })
    const courier = buildCourier()
    const { service, execute, notifications, created } = buildService(delivery, courier)

    await service.assign(delivery.id, courier.id, 'admin-1')

    expect(execute.mock.calls[0][1]).toEqual([courier.id, 1, delivery.id])
    expect(created.map(e => e.type)).toEqual([DeliveryEventType.REASSIGNED, DeliveryEventType.ASSIGNED_BY_ADMIN])
    expect(created[0].payload).toEqual({ releasedCourierId: previous.id, byAdmin: true })
    const released = notifications.send.mock.calls.find(([opts]) => opts.user.id === 'user-courier-0')
    expect(released?.[0].title).toBe('Course réattribuée')
  })

  it('refuses once the parcel has been picked up', async () => {
    const delivery = buildDelivery({ status: DeliveryStatus.PICKED_UP, courier: buildCourier() })
    const { service, execute } = buildService(delivery, buildCourier({ id: 'courier-2' }))

    await expect(service.assign(delivery.id, 'courier-2', 'admin-1')).rejects.toBeInstanceOf(BadRequestException)
    expect(execute).not.toHaveBeenCalled()
  })

  it('refuses a courier that is not validated', async () => {
    const delivery = buildDelivery()
    const courier = buildCourier({ validationStatus: ValidationStatus.PENDING })
    const { service, execute } = buildService(delivery, courier)

    await expect(service.assign(delivery.id, courier.id, 'admin-1')).rejects.toBeInstanceOf(BadRequestException)
    expect(execute).not.toHaveBeenCalled()
  })

  it('refuses the courier already holding the delivery', async () => {
    const courier = buildCourier()
    const delivery = buildDelivery({ status: DeliveryStatus.ACCEPTED, courier })
    const { service, execute } = buildService(delivery, courier)

    await expect(service.assign(delivery.id, courier.id, 'admin-1')).rejects.toBeInstanceOf(BadRequestException)
    expect(execute).not.toHaveBeenCalled()
  })

  it('reports a conflict when the delivery moved on between the read and the claim', async () => {
    const delivery = buildDelivery()
    const courier = buildCourier()
    const { service, execute, notifications } = buildService(delivery, courier)
    execute.mockResolvedValueOnce([])

    await expect(service.assign(delivery.id, courier.id, 'admin-1')).rejects.toBeInstanceOf(ConflictException)
    expect(notifications.send).not.toHaveBeenCalled()
  })
})

describe('rebroadcast', () => {
  it('re-offers an unclaimed delivery through the dispatcher', async () => {
    const delivery = buildDelivery()
    const { service, dispatch, created } = buildService(delivery, null)

    await service.rebroadcast(delivery.id, 'admin-1')

    expect(dispatch.broadcast).toHaveBeenCalledWith(delivery.id)
    expect(created[0].type).toBe(DeliveryEventType.BROADCAST)
  })

  it('refuses when a courier already holds the delivery', async () => {
    const delivery = buildDelivery({ status: DeliveryStatus.ACCEPTED, courier: buildCourier() })
    const { service, dispatch } = buildService(delivery, null)

    await expect(service.rebroadcast(delivery.id, 'admin-1')).rejects.toBeInstanceOf(BadRequestException)
    expect(dispatch.broadcast).not.toHaveBeenCalled()
  })
})
