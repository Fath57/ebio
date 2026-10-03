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
    { recordOutcome: vi.fn().mockResolvedValue(null), open: vi.fn(), attachReference: vi.fn(), markFailed: vi.fn() } as never,
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
      { recordOutcome: vi.fn().mockResolvedValue(null), open: vi.fn(), attachReference: vi.fn(), markFailed: vi.fn() } as never,
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
    const service = new TopupService(em as never, wallet as never, {} as never, {} as never)
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

describe('règlement d\'une recharge abandonnée puis payée', () => {
  it('accepte de créditer une recharge marquée en échec si le prestataire confirme le paiement', async () => {
    const topup = { id: 'topup-1', amount: '1000', wallet: { id: 'wallet-1' } }
    const em = {
      findOne: vi.fn().mockResolvedValue(topup),
      execute: vi.fn().mockResolvedValue({ affectedRows: 1 }),
      transactional: vi.fn(),
    }
    em.transactional.mockImplementation(async (work: (txEm: typeof em) => Promise<unknown>) => work(em))
    const service = new TopupService(em as never, { credit: vi.fn() } as never, {} as never, {} as never)

    await service.settleFromProvider('42', 'completed')
    expect(em.execute.mock.calls[0][0]).toContain(`status IN ('PENDING', 'FAILED')`)

    em.execute.mockClear()
    await service.settleFromProvider('42', 'failed')
    expect(em.execute.mock.calls[0][0]).toContain(`status IN ('PENDING')`)
  })
})

describe('ouverture d\'une recharge', () => {
  function buildInitiateService(initiatePayment: ReturnType<typeof vi.fn>) {
    const topup = { id: 'topup-1', status: TopupStatus.PENDING, fedapayTransactionId: null as string | null }
    const em = {
      create: vi.fn().mockReturnValue(topup),
      findOneOrFail: vi.fn().mockResolvedValue({ id: 'user-1' }),
      flush: vi.fn(),
    }
    const operation = { id: 'op-1' }
    const journal = {
      open: vi.fn().mockResolvedValue(operation),
      attachReference: vi.fn(),
      markFailed: vi.fn(),
    }
    const gateway = { hostsPaymentPage: () => true, initiatePayment }
    const service = new TopupService(
      em as never,
      { getOrCreate: vi.fn().mockResolvedValue({ id: 'wallet-1' }) } as never,
      { createGateway: () => gateway } as never,
      journal as never,
    )
    return { service, topup, journal, operation }
  }

  it('écrit l\'opération au journal avec la référence du prestataire', async () => {
    const { service, topup, journal, operation } = buildInitiateService(
      vi.fn().mockResolvedValue({ providerTransactionId: 'ABC123', redirectUrl: 'https://gateway/ABC123' }),
    )

    await service.initiate('user-1', 1000)

    expect(journal.open).toHaveBeenCalledWith(expect.objectContaining({ subjectId: 'topup-1', amount: 1000 }))
    expect(journal.attachReference).toHaveBeenCalledWith(operation, 'ABC123')
    expect(topup.fedapayTransactionId).toBe('ABC123')
  })

  it('marque la recharge et l\'opération en échec quand le prestataire refuse l\'ouverture', async () => {
    const { service, topup, journal } = buildInitiateService(vi.fn().mockRejectedValue(new Error('504')))

    await expect(service.initiate('user-1', 1000)).rejects.toBeInstanceOf(BadRequestException)

    expect(topup.status).toBe(TopupStatus.FAILED)
    expect(journal.markFailed).toHaveBeenCalled()
  })

  it('ne laisse pas en attente une recharge sans référence', async () => {
    const { service, topup, journal } = buildInitiateService(vi.fn().mockResolvedValue({ providerTransactionId: undefined }))

    await expect(service.initiate('user-1', 1000)).rejects.toBeInstanceOf(BadRequestException)

    expect(topup.status).toBe(TopupStatus.FAILED)
    expect(journal.markFailed).toHaveBeenCalled()
  })
})
