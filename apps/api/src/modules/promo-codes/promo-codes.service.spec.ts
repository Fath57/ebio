import { BadRequestException } from '@nestjs/common'
import { PromoCodesService } from './promo-codes.service'

/**
 * redeem() is the last word on a code: check() may have answered for two
 * orders racing on the same slot, only the locked row decides.
 */
function buildService(row: Record<string, unknown> | undefined, userUses = 0) {
  const em = {
    execute: vi.fn().mockResolvedValueOnce(row ? [row] : []).mockResolvedValue({ affectedRows: 1 }),
    count: vi.fn().mockResolvedValue(userUses),
    create: vi.fn(),
    flush: vi.fn(),
    getReference: vi.fn((_entity: unknown, id: string) => ({ id })),
    transactional: vi.fn(),
  }
  em.transactional.mockImplementation(async (work: (txEm: typeof em) => Promise<unknown>) => work(em))
  return { service: new PromoCodesService(em as never), em }
}

const inputPromo = { id: 'promo-1' } as never
const activeRow = { is_active: true, max_uses: 10, use_count: 3, max_uses_per_user: 1 }

describe('utilisation d\'un code promo', () => {
  it('verrouille le code avant de compter les utilisations de l\'acheteur', async () => {
    const { service, em } = buildService(activeRow)

    await service.redeem(inputPromo, 'order-1', 'user-1', 500)

    expect(em.execute.mock.calls[0][0]).toContain('FOR UPDATE')
    expect(em.execute.mock.calls[1][0]).toContain('use_count = use_count + 1')
    expect(em.create).toHaveBeenCalledOnce()
  })

  it('refuse un acheteur qui a déjà atteint sa limite', async () => {
    const { service, em } = buildService(activeRow, 1)

    await expect(service.redeem(inputPromo, 'order-1', 'user-1', 500)).rejects.toThrow('Vous avez déjà utilisé ce code')
    expect(em.execute).toHaveBeenCalledOnce()
    expect(em.create).not.toHaveBeenCalled()
  })

  it('refuse la dernière place déjà prise', async () => {
    const { service } = buildService({ ...activeRow, use_count: 10 })

    await expect(service.redeem(inputPromo, 'order-1', 'user-1', 500)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('refuse un code désactivé entre-temps', async () => {
    const { service } = buildService({ ...activeRow, is_active: false })

    await expect(service.redeem(inputPromo, 'order-1', 'user-1', 500)).rejects.toBeInstanceOf(BadRequestException)
  })
})
