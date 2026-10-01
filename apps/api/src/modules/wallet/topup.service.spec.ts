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
      .rejects
      .toThrow(BadRequestException)
  })

  it('refuse un paiement échoué', async () => {
    const { service } = buildService(TopupStatus.FAILED, 'failed')
    await expect(service.verify('user-1', 'topup-1', 'ref-1'))
      .rejects
      .toThrow(/échoué/)
  })

  it('rend le solde une fois la recharge encaissée', async () => {
    const { service } = buildService(TopupStatus.COMPLETED, 'completed')
    await expect(service.verify('user-1', 'topup-1', 'ref-1'))
      .resolves
      .toEqual({ status: TopupStatus.COMPLETED, balance: 2500 })
  })
})

describe('recharge réglée par le webhook FedaPay', () => {
  function buildWebhookService(topupStatus: TopupStatus, check: { status: string, amount?: number }) {
    const topup = { id: 'topup-1', status: topupStatus, amount: '1000', fedapayTransactionId: '42' }
    const em = { findOne: vi.fn().mockResolvedValue(topup) }
    const gateway = { checkStatus: vi.fn().mockResolvedValue(check) }
    const service = new TopupService(
      em as never,
      {} as never,
      { createGateway: () => gateway } as never,
    )
    const settle = vi.spyOn(service, 'settleFromProvider').mockResolvedValue(true)
    return { service, em, gateway, settle }
  }

  it('crédite sur la parole de FedaPay, pas sur celle du corps reçu', async () => {
    const { service, gateway, settle } = buildWebhookService(TopupStatus.PENDING, { status: 'completed', amount: 1000 })

    await expect(service.settleFromWebhook('42')).resolves.toBe(true)

    expect(gateway.checkStatus).toHaveBeenCalledWith('42')
    expect(settle).toHaveBeenCalledWith('42', 'completed')
  })

  it('ne crédite rien tant que FedaPay ne confirme pas', async () => {
    const { service, settle } = buildWebhookService(TopupStatus.PENDING, { status: 'pending' })

    await expect(service.settleFromWebhook('42')).resolves.toBe(true)

    expect(settle).not.toHaveBeenCalled()
  })

  it('refuse un montant payé différent de la recharge', async () => {
    const { service, settle } = buildWebhookService(TopupStatus.PENDING, { status: 'completed', amount: 100 })

    await expect(service.settleFromWebhook('42')).resolves.toBe(true)

    expect(settle).not.toHaveBeenCalled()
  })

  it('n\'interroge pas FedaPay pour une recharge déjà réglée', async () => {
    const { service, gateway } = buildWebhookService(TopupStatus.COMPLETED, { status: 'completed', amount: 1000 })

    await expect(service.settleFromWebhook('42')).resolves.toBe(true)

    expect(gateway.checkStatus).not.toHaveBeenCalled()
  })

  it('laisse la main aux paiements de commande quand ce n\'est pas une recharge', async () => {
    const { service, em, gateway } = buildWebhookService(TopupStatus.PENDING, { status: 'completed' })
    em.findOne.mockResolvedValue(null)

    await expect(service.settleFromWebhook('42')).resolves.toBe(false)

    expect(gateway.checkStatus).not.toHaveBeenCalled()
  })
})

describe('règlement d\'une recharge', () => {
  function buildSettleService(affectedRows: number) {
    const topup = { id: 'topup-1', amount: '1000', wallet: { id: 'wallet-1' } }
    const em = {
      findOne: vi.fn().mockResolvedValue(topup),
      execute: vi.fn().mockResolvedValue({ affectedRows }),
      transactional: vi.fn(),
    }
    em.transactional.mockImplementation(async (work: (txEm: typeof em) => Promise<unknown>) => work(em))
    const wallet = { credit: vi.fn().mockResolvedValue(1000) }
    const service = new TopupService(em as never, wallet as never, {} as never)
    return { service, em, wallet }
  }

  it('marque la recharge réglée et crédite dans une même transaction', async () => {
    const { service, em, wallet } = buildSettleService(1)

    await expect(service.settleFromProvider('42', 'completed')).resolves.toBe(true)

    expect(em.transactional).toHaveBeenCalledOnce()
    expect(wallet.credit).toHaveBeenCalledWith('wallet-1', expect.objectContaining({ amount: 1000 }))
  })

  it('laisse remonter un crédit qui échoue, pour que la recharge reste en attente', async () => {
    const { service, wallet } = buildSettleService(1)
    wallet.credit.mockRejectedValueOnce(new Error('portefeuille indisponible'))

    await expect(service.settleFromProvider('42', 'completed')).rejects.toThrow('portefeuille indisponible')
  })

  it('ne crédite pas une recharge déjà réglée', async () => {
    const { service, wallet } = buildSettleService(0)

    await expect(service.settleFromProvider('42', 'completed')).resolves.toBe(true)

    expect(wallet.credit).not.toHaveBeenCalled()
  })

  it('ne crédite pas une recharge en échec', async () => {
    const { service, wallet } = buildSettleService(1)

    await service.settleFromProvider('42', 'failed')

    expect(wallet.credit).not.toHaveBeenCalled()
  })
})
