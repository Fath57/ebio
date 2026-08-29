import { DispatchService } from './dispatch.service'
import { DeliveryStatus } from './entities/delivery.entity'

function buildService() {
  const execute = vi.fn().mockResolvedValue([])
  const em = {
    findOne: vi.fn(),
    find: vi.fn().mockResolvedValue([]),
    create: vi.fn((_entity: unknown, data: Record<string, unknown>) => ({ ...data })),
    flush: vi.fn(),
    getConnection: () => ({ execute }),
  }
  const notifications = { send: vi.fn().mockResolvedValue(undefined) }
  const service = new DispatchService(em as never, notifications as never)
  return { service, em, execute, notifications }
}

interface TestDelivery {
  id: string
  status: DeliveryStatus
  broadcastRadiusKm: number
  reassignmentCount: number
  offeredAt: Date
  acceptedAt?: Date
  pickupAddress: string
  courier: { id: string, user: { id: string } } | null
  order: { id: string, orderNumber: string, supplier: { shopName: string } }
}

function buildDelivery(extra: Partial<TestDelivery> = {}): TestDelivery {
  return {
    id: 'delivery-1',
    status: DeliveryStatus.AWAITING_COURIER,
    broadcastRadiusKm: 5,
    reassignmentCount: 0,
    offeredAt: new Date(Date.now() - 11 * 60 * 1000),
    pickupAddress: 'Marché Dantokpa',
    courier: null,
    order: {
      id: 'order-1',
      orderNumber: 'EB-20260824-001',
      supplier: { shopName: 'Bio Shop' },
    },
    ...extra,
  }
}

describe('dispatchService', () => {
  describe('findEligibleCouriers', () => {
    it('filters by distance and freshness when the pickup has a location', async () => {
      const { service, execute } = buildService()
      execute
        .mockResolvedValueOnce([{ has_location: true }])
        .mockResolvedValueOnce([{ id: 'c1', user_id: 'u1' }])
      const result = await service.findEligibleCouriers('delivery-1')
      expect(result).toEqual([{ id: 'c1', user_id: 'u1' }])
      const proximitySql = execute.mock.calls[1][0] as string
      expect(proximitySql).toContain('ST_DWithin')
      expect(proximitySql).toContain(`INTERVAL '12 hours'`)
    })

    it('falls back to every available courier when the pickup has no location', async () => {
      const { service, execute } = buildService()
      execute
        .mockResolvedValueOnce([{ has_location: false }])
        .mockResolvedValueOnce([{ id: 'c1', user_id: 'u1' }, { id: 'c2', user_id: 'u2' }])
      const result = await service.findEligibleCouriers('delivery-1')
      expect(result).toHaveLength(2)
      const fallbackSql = execute.mock.calls[1][0] as string
      expect(fallbackSql).not.toContain('ST_DWithin')
    })
  })

  describe('broadcast', () => {
    it('pushes the offer to each eligible courier and journals the broadcast', async () => {
      const { service, em, execute, notifications } = buildService()
      em.findOne.mockResolvedValueOnce(buildDelivery())
      execute
        .mockResolvedValueOnce([{ has_location: true }])
        .mockResolvedValueOnce([{ id: 'c1', user_id: 'u1' }, { id: 'c2', user_id: 'u2' }])
      em.find.mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }])
      const notified = await service.broadcast('delivery-1')
      expect(notified).toBe(2)
      expect(notifications.send).toHaveBeenCalledTimes(2)
      expect(em.create).toHaveBeenCalledOnce()
    })

    it('does nothing for a delivery that is no longer awaiting a courier', async () => {
      const { service, em, notifications } = buildService()
      em.findOne.mockResolvedValueOnce(buildDelivery({ status: DeliveryStatus.ACCEPTED }))
      const notified = await service.broadcast('delivery-1')
      expect(notified).toBe(0)
      expect(notifications.send).not.toHaveBeenCalled()
    })
  })

  describe('rebroadcastStale', () => {
    it('widens the radius by 5 km and caps it at 25 km', async () => {
      const { service, em } = buildService()
      const nearCap = buildDelivery({ broadcastRadiusKm: 22 })
      em.find.mockResolvedValueOnce([nearCap])
      const broadcastSpy = vi.spyOn(service, 'broadcast').mockResolvedValue(0)
      await service.rebroadcastStale()
      expect(nearCap.broadcastRadiusKm).toBe(25)
      expect(broadcastSpy).toHaveBeenCalledWith('delivery-1')
    })
  })

  describe('reassignStuck', () => {
    it('releases the courier, notifies them and re-offers the delivery', async () => {
      const { service, em, notifications } = buildService()
      const stuck = buildDelivery({
        status: DeliveryStatus.ACCEPTED,
        acceptedAt: new Date(Date.now() - 16 * 60 * 1000),
        courier: { id: 'c1', user: { id: 'u1' } },
      })
      em.find.mockResolvedValueOnce([stuck])
      const broadcastSpy = vi.spyOn(service, 'broadcast').mockResolvedValue(0)
      await service.reassignStuck()
      expect(stuck.courier).toBeNull()
      expect(stuck.status).toBe(DeliveryStatus.AWAITING_COURIER)
      expect(stuck.reassignmentCount).toBe(1)
      expect(notifications.send).toHaveBeenCalledOnce()
      expect(broadcastSpy).toHaveBeenCalledWith('delivery-1')
    })
  })
})
