import { BadRequestException } from '@nestjs/common'
import { TopupStatus } from './entities/wallet-topup.entity'
import { TopupService } from './topup.service'

/**
 * A verification that answers 200 for a payment still in flight is a trap:
 * every caller reads the HTTP code, and the app announced a recharge that had
 * not happened while the wallet stayed untouched.
 */
function buildService(topupStatus: TopupStatus, providerStatus: string) {
  const topup = {
    id: 'topup-1',
    status: TopupStatus.PENDING,
    amount: '1000',
    fedapayTransactionId: null as string | null,
  }
  const fresh = { id: 'topup-1', status: topupStatus, wallet: { balance: '2500' } }

  const em = {
    findOne: vi.fn().mockResolvedValue(topup),
    findOneOrFail: vi.fn().mockResolvedValue(fresh),
    flush: vi.fn(),
    clear: vi.fn(),
  }
  const gateway = {
    checkStatus: vi.fn().mockResolvedValue({ status: providerStatus, amount: 1000 }),
    hostsPaymentPage: () => true,
  }
  const service = new TopupService(
    em as never,
    { getOrCreate: vi.fn() } as never,
    { createGateway: () => gateway } as never,
  )
  // settleFromProvider does the crediting; the contract under test is what
  // verify() answers once it has run.
  vi.spyOn(service, 'settleFromProvider').mockResolvedValue(true)
  return { service, em, gateway }
}

describe('vérification d\'une recharge', () => {
  it('refuse tant que le paiement n\'est pas abouti', async () => {
    const { service } = buildService(TopupStatus.PENDING, 'pending')
    await expect(service.verify('user-1', 'topup-1', 'ref-1'))
      .rejects.toThrow(BadRequestException)
  })

  it('refuse un paiement échoué', async () => {
    const { service } = buildService(TopupStatus.FAILED, 'failed')
    await expect(service.verify('user-1', 'topup-1', 'ref-1'))
      .rejects.toThrow(/échoué/)
  })

  it('rend le solde une fois la recharge encaissée', async () => {
    const { service } = buildService(TopupStatus.COMPLETED, 'completed')
    await expect(service.verify('user-1', 'topup-1', 'ref-1'))
      .resolves.toEqual({ status: TopupStatus.COMPLETED, balance: 2500 })
  })
})
