import { BadRequestException } from '@nestjs/common'
import { OrderStatus } from '../orders/entities/order.entity'
import { ProductReviewsService } from './product-reviews.service'

const BUYER = 'buyer-1'
const ORDER = 'order-1'

interface TestItem {
  id: string
  product: { id: string, name: string, photos: string[] }
}

function buildService(options: {
  status?: OrderStatus
  buyerId?: string
  items?: TestItem[]
  existingReviews?: Array<{ orderItem: { id: string } }>
} = {}) {
  const items = options.items ?? [
    { id: 'item-1', product: { id: 'product-1', name: 'Tomates', photos: [] } },
    { id: 'item-2', product: { id: 'product-2', name: 'Miel', photos: [] } },
  ]
  const order = {
    id: ORDER,
    status: options.status ?? OrderStatus.DELIVERED,
    buyer: { id: options.buyerId ?? BUYER },
  }

  const created: Array<Record<string, unknown>> = []
  const execute = vi.fn().mockResolvedValue([{ weighted_avg: 4, total: 1 }])
  const em = {
    findOne: vi.fn().mockResolvedValue(order),
    // First call resolves the order lines, second the reviews already left.
    find: vi.fn()
      .mockResolvedValueOnce(items)
      .mockResolvedValueOnce(options.existingReviews ?? []),
    create: vi.fn((_entity: unknown, data: Record<string, unknown>) => {
      created.push(data)
      return data
    }),
    getReference: vi.fn((_entity: unknown, id: string) => ({ id })),
    flush: vi.fn(),
    nativeUpdate: vi.fn(),
    getConnection: () => ({ execute }),
  }
  const fraud = { detectMultipleAccounts: vi.fn().mockResolvedValue({ isSuspicious: false, sharedAccounts: [] }) }
  const service = new ProductReviewsService(em as never, fraud as never)
  return { service, em, fraud, created, execute, items }
}

describe('productReviewsService', () => {
  describe('éligibilité', () => {
    it('refuse une commande qui n\'est pas livrée', async () => {
      const { service } = buildService({ status: OrderStatus.PLACED })
      await expect(
        service.createMany(ORDER, BUYER, { reviews: [{ orderItemId: 'item-1', rating: 5 }] }),
      ).rejects.toThrow(BadRequestException)
    })

    it('refuse la commande d\'un autre acheteur', async () => {
      const { service } = buildService({ buyerId: 'someone-else' })
      await expect(
        service.createMany(ORDER, BUYER, { reviews: [{ orderItemId: 'item-1', rating: 5 }] }),
      ).rejects.toThrow(BadRequestException)
    })

    it('refuse une ligne qui n\'appartient pas à la commande', async () => {
      const { service } = buildService()
      await expect(
        service.createMany(ORDER, BUYER, { reviews: [{ orderItemId: 'item-ailleurs', rating: 5 }] }),
      ).rejects.toThrow(BadRequestException)
    })

    it('rend une liste vide plutôt qu\'une erreur quand la commande n\'est pas livrée', async () => {
      const { service } = buildService({ status: OrderStatus.PLACED })
      // L'étape est alors sautée, pas cassée.
      await expect(service.listRateableItems(ORDER, BUYER)).resolves.toEqual({ items: [] })
    })
  })

  describe('un avis par ligne de commande', () => {
    it('ignore une ligne déjà notée au lieu de refuser tout le lot', async () => {
      // Un renvoi après coupure réseau ne doit pas échouer sur un doublon.
      const { service, created } = buildService({
        existingReviews: [{ orderItem: { id: 'item-1' } }],
      })
      const result = await service.createMany(ORDER, BUYER, {
        reviews: [
          { orderItemId: 'item-1', rating: 5 },
          { orderItemId: 'item-2', rating: 3 },
        ],
      })
      expect(result).toEqual({ created: 1, skipped: 1 })
      expect(created).toHaveLength(1)
      expect(created[0]).toMatchObject({ rating: 3 })
    })

    it('crée un avis par ligne notée et recalcule chaque produit touché', async () => {
      const { service, created, em } = buildService()
      const result = await service.createMany(ORDER, BUYER, {
        reviews: [
          { orderItemId: 'item-1', rating: 4, comment: 'Bien mûres.' },
          { orderItemId: 'item-2', rating: 5 },
        ],
      })
      expect(result).toEqual({ created: 2, skipped: 0 })
      expect(created).toHaveLength(2)
      // Deux produits distincts touchés, donc deux recalculs.
      expect(em.nativeUpdate).toHaveBeenCalledTimes(2)
    })

    it('n\'appelle pas la détection de fraude quand rien n\'a été créé', async () => {
      const { service, fraud } = buildService({
        existingReviews: [{ orderItem: { id: 'item-1' } }],
      })
      await service.createMany(ORDER, BUYER, { reviews: [{ orderItemId: 'item-1', rating: 5 }] })
      expect(fraud.detectMultipleAccounts).not.toHaveBeenCalled()
    })
  })

  describe('seuil d\'affichage de la moyenne', () => {
    it('laisse la moyenne à null sous trois avis', async () => {
      const { service, em, execute } = buildService()
      execute.mockResolvedValueOnce([{ weighted_avg: 4.5, total: 2 }])
      await service.recalculateProductRating('product-1')
      expect(em.nativeUpdate).toHaveBeenCalledWith(
        expect.anything(),
        { id: 'product-1' },
        { ratingAvg: null, ratingCount: 2 },
      )
    })

    it('publie la moyenne à partir de trois avis', async () => {
      const { service, em, execute } = buildService()
      execute.mockResolvedValueOnce([{ weighted_avg: 4.46, total: 3 }])
      await service.recalculateProductRating('product-1')
      expect(em.nativeUpdate).toHaveBeenCalledWith(
        expect.anything(),
        { id: 'product-1' },
        { ratingAvg: 4.5, ratingCount: 3 },
      )
    })

    it('ne compte que les avis visibles', async () => {
      const { service, execute } = buildService()
      execute.mockResolvedValueOnce([{ weighted_avg: 5, total: 3 }])
      await service.recalculateProductRating('product-1')
      const [sql] = execute.mock.calls[0]
      expect(sql).toContain('is_hidden = false')
      // La pondération des 90 jours, reprise des boutiques.
      expect(sql).toContain(`INTERVAL '90 days'`)
    })
  })
})
