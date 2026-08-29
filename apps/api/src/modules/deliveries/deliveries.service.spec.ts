import { BadRequestException, ConflictException, ForbiddenException, GoneException, UnprocessableEntityException } from '@nestjs/common'
import { OrderStatus } from '../orders/entities/order.entity'
import { ValidationStatus } from '../suppliers/supplier.entity'
import { DeliveriesService } from './deliveries.service'
import { DeliveryStatus } from './entities/delivery.entity'

interface MockEm {
  findOne: ReturnType<typeof vi.fn>
  findOneOrFail: ReturnType<typeof vi.fn>
  find: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  flush: ReturnType<typeof vi.fn>
  getConnection: () => { execute: ReturnType<typeof vi.fn> }
}

function buildService() {
  const execute = vi.fn().mockResolvedValue([])
  const em: MockEm = {
    findOne: vi.fn(),
    findOneOrFail: vi.fn(),
    find: vi.fn().mockResolvedValue([]),
    create: vi.fn((_entity: unknown, data: Record<string, unknown>) => ({ ...data })),
    flush: vi.fn(),
    getConnection: () => ({ execute }),
  }
  const notifications = { send: vi.fn().mockResolvedValue(undefined) }
  const dispatch = { broadcast: vi.fn().mockResolvedValue(0) }
  const orders = { applyStatusFromDelivery: vi.fn().mockResolvedValue(undefined) }
  const wallet = {
    getOrCreate: vi.fn().mockResolvedValue({ id: 'wallet-1', balance: '0' }),
    credit: vi.fn().mockResolvedValue(0),
    debit: vi.fn().mockResolvedValue(0),
  }
  const settings = { getDeliveryCommissionRate: vi.fn().mockResolvedValue(0.1) }
  const service = new DeliveriesService(
    em as never,
    notifications as never,
    dispatch as never,
    orders as never,
    wallet as never,
    settings as never,
  )
  return { service, em, execute, notifications, dispatch, orders, wallet, settings }
}

const validProfile = {
  id: 'courier-1',
  user: { id: 'user-1' },
  fullName: 'Jean Livreur',
  phone: '+2290197000000',
  validationStatus: ValidationStatus.VALIDATED,
  isAvailable: true,
}

function buildDelivery(status: DeliveryStatus, extra: Record<string, unknown> = {}, paymentMethod = 'FEDAPAY') {
  return {
    id: 'delivery-1',
    status,
    createdAt: new Date('2026-08-24T08:00:00Z'),
    courier: { id: 'courier-1', user: { id: 'user-1' } },
    order: {
      id: 'order-1',
      orderNumber: 'EB-20260824-001',
      paymentMethod,
      buyer: { id: 'buyer-1', name: 'Amina' },
      supplier: { id: 'supplier-1', shopName: 'Bio Shop', user: { id: 'sup-user-1', email: 'k@e.io' } },
      items: { isInitialized: () => false, count: () => 0 },
    },
    ...extra,
  }
}

describe('deliveriesService', () => {
  describe('registerCourier', () => {
    it('rejects a second application for the same account', async () => {
      const { service, em } = buildService()
      em.findOne.mockResolvedValueOnce({ id: 'existing' })
      await expect(service.registerCourier('user-1', {
        fullName: 'Jean',
        phone: '+2290197000000',
        vehicleType: 'MOTO',
        zone: 'Cotonou',
      })).rejects.toBeInstanceOf(ConflictException)
    })
  })

  describe('setAvailability', () => {
    it('refuses when the profile is not validated', async () => {
      const { service, em } = buildService()
      em.findOne.mockResolvedValueOnce({ ...validProfile, validationStatus: ValidationStatus.PENDING })
      await expect(service.setAvailability('user-1', true)).rejects.toBeInstanceOf(ForbiddenException)
    })
  })

  describe('accept (atomic claim)', () => {
    it('returns 409 when another courier already claimed the delivery', async () => {
      const { service, em, execute } = buildService()
      em.findOne
        .mockResolvedValueOnce(validProfile)
        .mockResolvedValueOnce(buildDelivery(DeliveryStatus.ACCEPTED))
      execute.mockResolvedValueOnce([])
      await expect(service.accept('delivery-1', 'user-1')).rejects.toBeInstanceOf(ConflictException)
    })

    it('returns 410 when the order was cancelled meanwhile', async () => {
      const { service, em, execute } = buildService()
      em.findOne
        .mockResolvedValueOnce(validProfile)
        .mockResolvedValueOnce(buildDelivery(DeliveryStatus.CANCELLED))
      execute.mockResolvedValueOnce([])
      await expect(service.accept('delivery-1', 'user-1')).rejects.toBeInstanceOf(GoneException)
    })

    it('refuses a courier that is offline', async () => {
      const { service, em } = buildService()
      em.findOne.mockResolvedValueOnce({ ...validProfile, isAvailable: false })
      await expect(service.accept('delivery-1', 'user-1')).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('notifies buyer and supplier on a successful claim', async () => {
      const { service, em, execute, notifications } = buildService()
      const delivery = buildDelivery(DeliveryStatus.ACCEPTED)
      em.findOne
        .mockResolvedValueOnce(validProfile)
        .mockResolvedValueOnce(delivery)
      execute.mockResolvedValueOnce([{ id: 'delivery-1' }])
      const result = await service.accept('delivery-1', 'user-1')
      expect(result).toBe(delivery)
      expect(notifications.send).toHaveBeenCalledTimes(2)
    })
  })

  describe('transitions', () => {
    it('refuses pickup on a delivery that is not accepted', async () => {
      const { service, em } = buildService()
      em.findOne.mockResolvedValueOnce(buildDelivery(DeliveryStatus.AWAITING_COURIER, { courier: { id: 'courier-1', user: { id: 'user-1' } } }))
      await expect(service.pickup('delivery-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException)
    })

    it('drives the order to IN_DELIVERY on pickup and sends the code to the buyer', async () => {
      const { service, em, orders, notifications } = buildService()
      const delivery = buildDelivery(DeliveryStatus.ACCEPTED)
      em.findOne.mockResolvedValueOnce(delivery)
      const result = await service.pickup('delivery-1', 'user-1')
      expect(result.status).toBe(DeliveryStatus.PICKED_UP)
      expect(result.confirmationCode).toMatch(/^\d{4}$/)
      expect(orders.applyStatusFromDelivery).toHaveBeenCalledWith('order-1', OrderStatus.IN_DELIVERY)
      expect(notifications.send).toHaveBeenCalledOnce()
    })

    it('clamps a future occurredAt to now', async () => {
      const { service, em } = buildService()
      const delivery = buildDelivery(DeliveryStatus.ACCEPTED)
      em.findOne.mockResolvedValueOnce(delivery)
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      const result = await service.pickup('delivery-1', 'user-1', future)
      expect(result.pickedUpAt!.getTime()).toBeLessThanOrEqual(Date.now())
    })

    it('clamps occurredAt below the previous event floor', async () => {
      const { service, em } = buildService()
      const delivery = buildDelivery(DeliveryStatus.ACCEPTED)
      const floor = new Date('2026-08-24T10:00:00Z')
      em.findOne.mockResolvedValueOnce(delivery)
      em.find.mockResolvedValueOnce([{ occurredAt: floor }])
      const result = await service.pickup('delivery-1', 'user-1', '2026-08-24T09:00:00Z')
      expect(result.pickedUpAt!.getTime()).toBe(floor.getTime())
    })

    it('rejects delivery completion with a wrong confirmation code', async () => {
      const { service, em } = buildService()
      const delivery = buildDelivery(DeliveryStatus.IN_TRANSIT, { confirmationCode: '1234' })
      em.findOne.mockResolvedValueOnce(delivery)
      await expect(service.complete('delivery-1', 'user-1', { proofType: 'CODE', code: '0000' }))
        .rejects
        .toBeInstanceOf(UnprocessableEntityException)
    })

    it('completes with the right code and drives the order to DELIVERED', async () => {
      const { service, em, orders } = buildService()
      const delivery = buildDelivery(DeliveryStatus.IN_TRANSIT, { confirmationCode: '1234' })
      em.findOne.mockResolvedValueOnce(delivery)
      const result = await service.complete('delivery-1', 'user-1', { proofType: 'CODE', code: '1234' })
      expect(result.status).toBe(DeliveryStatus.DELIVERED)
      expect(orders.applyStatusFromDelivery).toHaveBeenCalledWith('order-1', OrderStatus.DELIVERED)
    })

    it('credits the courier share on an online-paid order', async () => {
      const { service, em, wallet, notifications } = buildService()
      const delivery = buildDelivery(DeliveryStatus.IN_TRANSIT, {
        confirmationCode: '1234',
        deliveryFee: 1000,
        courierFee: 900,
      })
      em.findOne.mockResolvedValueOnce(delivery)
      em.findOneOrFail.mockResolvedValueOnce({ id: 'user-1' })
      await service.complete('delivery-1', 'user-1', { proofType: 'CODE', code: '1234' })
      expect(wallet.getOrCreate).toHaveBeenCalledWith({ courierId: 'courier-1' })
      expect(wallet.credit).toHaveBeenCalledWith('wallet-1', expect.objectContaining({
        type: 'DELIVERY_EARNING',
        amount: 900,
        deliveryId: 'delivery-1',
      }))
      expect(wallet.debit).not.toHaveBeenCalled()
      expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'COURIER_EARNING' }))
    })

    it('debits the platform cut on a cash order, allowing a negative balance', async () => {
      const { service, em, wallet } = buildService()
      const delivery = buildDelivery(DeliveryStatus.IN_TRANSIT, {
        confirmationCode: '1234',
        deliveryFee: 1000,
        courierFee: 900,
      }, 'CASH_ON_DELIVERY')
      em.findOne.mockResolvedValueOnce(delivery)
      em.findOneOrFail.mockResolvedValueOnce({ id: 'user-1' })
      await service.complete('delivery-1', 'user-1', { proofType: 'CODE', code: '1234' })
      expect(wallet.debit).toHaveBeenCalledWith('wallet-1', expect.objectContaining({
        type: 'DELIVERY_COMMISSION',
        amount: 100,
        allowNegative: true,
      }))
      expect(wallet.credit).not.toHaveBeenCalled()
    })

    it('settles the wallet once: an existing ledger line short-circuits', async () => {
      const { service, em, execute, wallet } = buildService()
      const delivery = buildDelivery(DeliveryStatus.IN_TRANSIT, {
        confirmationCode: '1234',
        deliveryFee: 1000,
        courierFee: 900,
      })
      em.findOne.mockResolvedValueOnce(delivery)
      execute.mockResolvedValueOnce([{ '?column?': 1 }])
      await service.complete('delivery-1', 'user-1', { proofType: 'CODE', code: '1234' })
      expect(wallet.credit).not.toHaveBeenCalled()
    })

    it('still completes the delivery when the wallet settlement throws', async () => {
      const { service, em, wallet, orders } = buildService()
      const delivery = buildDelivery(DeliveryStatus.IN_TRANSIT, {
        confirmationCode: '1234',
        deliveryFee: 1000,
        courierFee: 900,
      })
      em.findOne.mockResolvedValueOnce(delivery)
      wallet.credit.mockRejectedValueOnce(new Error('ledger down'))
      const result = await service.complete('delivery-1', 'user-1', { proofType: 'CODE', code: '1234' })
      expect(result.status).toBe(DeliveryStatus.DELIVERED)
      expect(orders.applyStatusFromDelivery).toHaveBeenCalledWith('order-1', OrderStatus.DELIVERED)
    })

    it('forbids transitions from a courier that does not own the delivery', async () => {
      const { service, em } = buildService()
      const delivery = buildDelivery(DeliveryStatus.ACCEPTED, { courier: { id: 'courier-2', user: { id: 'other-user' } } })
      em.findOne
        .mockResolvedValueOnce(delivery)
        .mockResolvedValueOnce({ id: 'courier-1' })
      await expect(service.pickup('delivery-1', 'user-1')).rejects.toBeInstanceOf(ForbiddenException)
    })
  })

  describe('handleSupplierTakeover (self-delivery)', () => {
    it('closes an unclaimed delivery as SELF_DELIVERED', async () => {
      const { service, em } = buildService()
      const delivery = buildDelivery(DeliveryStatus.AWAITING_COURIER, { courier: null })
      em.findOne.mockResolvedValueOnce(delivery)
      await service.handleSupplierTakeover({ id: 'order-1' } as never)
      expect(delivery.status).toBe(DeliveryStatus.CANCELLED)
    })

    it('blocks the manual move when a courier is already engaged', async () => {
      const { service, em } = buildService()
      em.findOne.mockResolvedValueOnce(buildDelivery(DeliveryStatus.PICKED_UP))
      await expect(service.handleSupplierTakeover({ id: 'order-1' } as never))
        .rejects
        .toBeInstanceOf(ConflictException)
    })
  })

  describe('cancelForOrder', () => {
    it('notifies the assigned courier when the order dies', async () => {
      const { service, em, notifications } = buildService()
      const delivery = buildDelivery(DeliveryStatus.ACCEPTED, {
        courier: { id: 'courier-1', user: { id: 'user-1' }, fullName: 'Jean' },
      })
      em.findOne.mockResolvedValueOnce(delivery)
      await service.cancelForOrder({ id: 'order-1', orderNumber: 'EB-1' } as never)
      expect(delivery.status).toBe(DeliveryStatus.CANCELLED)
      expect(notifications.send).toHaveBeenCalledOnce()
    })

    it('leaves already delivered deliveries untouched', async () => {
      const { service, em, notifications } = buildService()
      const delivery = buildDelivery(DeliveryStatus.DELIVERED)
      em.findOne.mockResolvedValueOnce(delivery)
      await service.cancelForOrder({ id: 'order-1', orderNumber: 'EB-1' } as never)
      expect(delivery.status).toBe(DeliveryStatus.DELIVERED)
      expect(notifications.send).not.toHaveBeenCalled()
    })
  })
})
