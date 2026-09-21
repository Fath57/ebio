import { DispatchService } from './dispatch.service'
import { DeliveryStatus, DispatchPhase } from './entities/delivery.entity'

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
  // No debt limit by default: the eligibility SQL stays exactly as before.
  const settings = { getCourierMaxDebt: vi.fn().mockResolvedValue(0) }
  const service = new DispatchService(em as never, notifications as never, settings as never)
  return { service, em, execute, notifications, settings }
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

/**
 * La recherche procède en trois requêtes : le rayon de l'objet diffusé, son
 * point de départ, puis les livreurs. Les deux premières viennent de la table
 * de l'objet — `deliveries` ou `delivery_runs` — et c'est tout ce qui distingue
 * une course isolée d'une tournée.
 */
function mockLookup(execute: ReturnType<typeof vi.fn>, options: { radiusKm?: number, origin?: { latitude: number, longitude: number } | null } = {}) {
  execute.mockResolvedValueOnce([{ broadcast_radius_km: options.radiusKm ?? 5 }])
  execute.mockResolvedValueOnce(options.origin === undefined || options.origin === null
    ? []
    : [{ latitude: options.origin.latitude, longitude: options.origin.longitude }])
}

describe('dispatchService', () => {
  describe('findEligibleCouriers', () => {
    it('keeps indebted couriers out once a debt limit is set', async () => {
      const { service, execute, settings } = buildService()
      settings.getCourierMaxDebt.mockResolvedValue(5000)
      mockLookup(execute)
      execute.mockResolvedValueOnce([])
      await service.findEligibleCouriers('delivery-1')
      const [sql, params] = execute.mock.calls[2]
      expect(sql).toContain('NOT EXISTS (SELECT 1 FROM wallets w')
      expect(params).toContain(-5000)
    })

    it('filters by distance and freshness when the pickup has a location', async () => {
      const { service, execute } = buildService()
      mockLookup(execute, { origin: { latitude: 6.36, longitude: 2.42 } })
      execute.mockResolvedValueOnce([{ id: 'c1', user_id: 'u1' }])
      const result = await service.findEligibleCouriers('delivery-1')
      expect(result).toEqual([{ id: 'c1', user_id: 'u1' }])
      const proximitySql = execute.mock.calls[2][0] as string
      expect(proximitySql).toContain('ST_DWithin')
      expect(proximitySql).toContain(`INTERVAL '12 hours'`)
    })

    it('falls back to every available courier when the pickup has no location', async () => {
      const { service, execute } = buildService()
      mockLookup(execute, { origin: null })
      execute.mockResolvedValueOnce([{ id: 'c1', user_id: 'u1' }, { id: 'c2', user_id: 'u2' }])
      const result = await service.findEligibleCouriers('delivery-1')
      expect(result).toHaveLength(2)
      const fallbackSql = execute.mock.calls[2][0] as string
      expect(fallbackSql).not.toContain('ST_DWithin')
    })

    it('cherche les livreurs d\'une tournée depuis sa table, pas depuis les courses', async () => {
      const { service, execute } = buildService()
      execute.mockResolvedValueOnce([{ latitude: 6.36, longitude: 2.42 }])
      execute.mockResolvedValueOnce([{ id: 'c1', user_id: 'u1' }])
      const result = await service.findEligibleFor({ kind: 'RUN', id: 'run-1', broadcastRadiusKm: 5 })
      expect(result).toEqual([{ id: 'c1', user_id: 'u1' }])
      expect(execute.mock.calls[0][0]).toContain('FROM "delivery_runs"')
    })
  })

  describe('broadcast', () => {
    it('pushes the offer to each eligible courier and journals the broadcast', async () => {
      const { service, em, execute, notifications } = buildService()
      em.findOne.mockResolvedValueOnce(buildDelivery())
      mockLookup(execute, { origin: { latitude: 6.36, longitude: 2.42 } })
      execute.mockResolvedValueOnce([{ id: 'c1', user_id: 'u1' }, { id: 'c2', user_id: 'u2' }])
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
      // A released run re-enters the targeted rounds, not the plain broadcast.
      const broadcastSpy = vi.spyOn(service, 'startDispatch').mockResolvedValue(undefined)
      await service.reassignStuck()
      expect(stuck.courier).toBeNull()
      expect(stuck.status).toBe(DeliveryStatus.AWAITING_COURIER)
      expect(stuck.reassignmentCount).toBe(1)
      expect(notifications.send).toHaveBeenCalledOnce()
      expect(broadcastSpy).toHaveBeenCalledWith('delivery-1')
    })
  })

  describe('tournées', () => {
    function buildRun(extra: Record<string, unknown> = {}) {
      return {
        id: 'run-1',
        status: 'AWAITING_COURIER',
        shopCount: 2,
        offerRound: 0,
        offersSent: 0,
        broadcastRadiusKm: 5,
        courierEarning: 720,
        pickupOrder: [],
        offeredToCourier: null,
        offerExpiresAt: null,
        dispatchStartedAt: null,
        checkout: { id: 'checkout-1' },
        deliveries: {
          isInitialized: () => true,
          getItems: () => extra.items ?? [],
        },
        ...extra,
      }
    }

    const readyDelivery = (id: string) => ({
      id,
      status: DeliveryStatus.AWAITING_COURIER,
      dispatchPhase: DispatchPhase.BROADCAST,
      pickupLatitude: 6.36,
      pickupLongitude: 2.42,
    })

    it('ne diffuse pas une tournée dont une boutique n\'a pas encore préparé', async () => {
      const { service, em } = buildService()
      // Deux boutiques annoncées, une seule livraison créée : la seconde
      // commande n'est pas prête, le livreur attendrait devant.
      em.findOne.mockResolvedValueOnce(buildRun({ items: [readyDelivery('d1')] }))
      const offerSpy = vi.spyOn(service, 'offerNextRun').mockResolvedValue(undefined)
      await service.startRunDispatch('run-1')
      expect(offerSpy).not.toHaveBeenCalled()
    })

    it('ouvre la diffusion quand toutes les boutiques ont préparé', async () => {
      const { service, em, execute } = buildService()
      const run = buildRun({ items: [readyDelivery('d1'), readyDelivery('d2')] })
      em.findOne.mockResolvedValueOnce(run)
      em.findOne.mockResolvedValueOnce({ id: 'checkout-1', deliveryLatitude: 6.37, deliveryLongitude: 2.41 })
      execute.mockResolvedValue([])
      const offerSpy = vi.spyOn(service, 'offerNextRun').mockResolvedValue(undefined)
      await service.startRunDispatch('run-1')
      expect(offerSpy).toHaveBeenCalledWith('run-1')
      expect(run.pickupOrder).toHaveLength(2)
      expect(run.dispatchStartedAt).toBeInstanceOf(Date)
    })

    it('renvoie une livraison de tournée vers sa tournée plutôt que de la diffuser seule', async () => {
      const { service, em } = buildService()
      em.findOne.mockResolvedValueOnce({
        id: 'd1',
        status: DeliveryStatus.AWAITING_COURIER,
        deliveryRun: { id: 'run-1' },
      })
      const runSpy = vi.spyOn(service, 'startRunDispatch').mockResolvedValue(undefined)
      await service.startDispatch('d1')
      expect(runSpy).toHaveBeenCalledWith('run-1')
    })

    it('élargit le rayon d\'une tournée sans preneur, plafonné à 25 km', async () => {
      const { service, em } = buildService()
      const run = buildRun({ broadcastRadiusKm: 22 })
      em.find.mockResolvedValueOnce([run])
      const broadcastSpy = vi.spyOn(service, 'broadcastRun').mockResolvedValue(0)
      await service.rebroadcastStaleRuns()
      expect(run.broadcastRadiusKm).toBe(25)
      expect(broadcastSpy).toHaveBeenCalledWith('run-1')
    })
  })
})
