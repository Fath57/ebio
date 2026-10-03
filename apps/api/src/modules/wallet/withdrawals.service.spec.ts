import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException } from '@nestjs/common'
import { IntramRequestError } from '../payments/gateways/intram-client'
import { WithdrawalStatus } from './entities/withdrawal-request.entity'
import { WithdrawalsService } from './withdrawals.service'

/**
 * Closing a request that gives the money back is one move: the status and
 * the credit commit together. A credit that fails must not leave a closed
 * request whose amount never came back.
 */
function buildService(options: { isReserved?: boolean } = {}) {
  const withdrawal = {
    id: 'withdrawal-1',
    amount: '5000',
    status: WithdrawalStatus.REJECTED,
    wallet: { id: 'wallet-1' },
    supplier: { id: 'shop-1' },
    payoutNumber: { phoneNumber: '97000000' },
  }
  const em = {
    execute: vi.fn().mockResolvedValue({ affectedRows: options.isReserved === false ? 0 : 1 }),
    clear: vi.fn(),
    findOneOrFail: vi.fn().mockResolvedValue(withdrawal),
    transactional: vi.fn(),
  }
  em.transactional.mockImplementation(async (work: () => Promise<unknown>) => work())
  const wallet = { credit: vi.fn().mockResolvedValue(5000) }
  const notifications = { send: vi.fn().mockResolvedValue(undefined) }
  const service = new WithdrawalsService(em as never, wallet as never, notifications as never, {} as never, {} as never)
  return { service, em, wallet }
}

describe('clôture d\'une demande de reversement', () => {
  it('refuse et rend le solde dans une même transaction', async () => {
    const { service, em, wallet } = buildService()

    await service.reject('withdrawal-1', 'admin-1', 'numéro invalide')

    expect(em.transactional).toHaveBeenCalledOnce()
    expect(em.execute.mock.calls[0][0]).toContain('UPDATE withdrawal_requests')
    expect(wallet.credit).toHaveBeenCalledWith('wallet-1', expect.objectContaining({
      type: 'WITHDRAWAL_REFUND',
      amount: 5000,
      withdrawalId: 'withdrawal-1',
    }))
  })

  it('fait échouer le refus quand le solde ne peut pas être rendu', async () => {
    const { service, wallet } = buildService()
    wallet.credit.mockRejectedValueOnce(new Error('portefeuille indisponible'))

    // Thrown inside the transaction: the status change is rolled back with it.
    await expect(service.reject('withdrawal-1', 'admin-1', 'numéro invalide')).rejects.toThrow('portefeuille indisponible')
  })

  it('ne rend rien deux fois quand la demande est déjà close', async () => {
    const { service, wallet } = buildService({ isReserved: false })

    await expect(service.cancelWithdrawal({ supplierId: 'shop-1' } as never, 'withdrawal-1')).rejects.toThrow()

    expect(wallet.credit).not.toHaveBeenCalled()
  })
})

describe('envoi d\'un reversement au prestataire', () => {
  function buildApproveService(createPayout: ReturnType<typeof vi.fn>, processedAt = new Date()) {
    const withdrawal = {
      id: 'withdrawal-1',
      amount: '5000',
      status: WithdrawalStatus.PROCESSING,
      wallet: { id: 'wallet-1' },
      supplier: { id: 'shop-1', shopName: 'Boutique' },
      courier: null,
      payoutNumber: { phoneNumber: '0196475848', operator: 'mtn_open', holderName: 'Ada Lovelace' },
      fedapayPayoutId: null as string | null,
      processedAt,
      createdAt: new Date(),
    }
    const supplier = { id: 'shop-1', shopName: 'Boutique', user: { id: 'user-1', email: null } }
    // Built on EntityManager's prototype: @EnsureRequestContext() on the cron
    // refuses anything else, and forks it for the run.
    const em = Object.assign(Object.create(EntityManager.prototype) as object, {
      execute: vi.fn().mockResolvedValue({ affectedRows: 1 }),
      clear: vi.fn(),
      flush: vi.fn(),
      find: vi.fn().mockResolvedValue([withdrawal]),
      findOneOrFail: vi.fn().mockImplementation(async (entity: { name: string }) => (entity.name === 'Supplier' ? supplier : withdrawal)),
      transactional: vi.fn(),
      fork: vi.fn(),
    })
    em.fork.mockReturnValue(em)
    em.transactional.mockImplementation(async (work: () => Promise<unknown>) => work())
    const wallet = { credit: vi.fn().mockResolvedValue(5000) }
    const notifications = { send: vi.fn().mockResolvedValue(undefined) }
    const factory = { createPayoutGateway: () => ({ createPayout }) }
    const operation = { id: 'op-1' }
    const journal = {
      open: vi.fn().mockResolvedValue(operation),
      findLatest: vi.fn().mockResolvedValue(operation),
      attachReference: vi.fn(),
      markFailed: vi.fn(),
      noteUncertain: vi.fn(),
    }
    const service = new WithdrawalsService(em as never, wallet as never, notifications as never, factory as never, journal as never)
    return { service, em, wallet, journal, withdrawal }
  }

  it('garde en cours, sans rendre le solde, un reversement resté sans réponse', async () => {
    const createPayout = vi.fn().mockRejectedValue(new IntramRequestError('INTRAM /payouts: timeout', 'timeout', true))
    const { service, wallet, journal } = buildApproveService(createPayout)

    await expect(service.approve('withdrawal-1', 'admin-1')).resolves.toBeDefined()

    expect(wallet.credit).not.toHaveBeenCalled()
    expect(journal.noteUncertain).toHaveBeenCalled()
    expect(journal.markFailed).not.toHaveBeenCalled()
  })

  it('rend le solde quand le prestataire refuse clairement', async () => {
    const createPayout = vi.fn().mockRejectedValue(new IntramRequestError('INTRAM /payouts: validation_error', 'validation_error', false))
    const { service, wallet, journal } = buildApproveService(createPayout)

    await expect(service.approve('withdrawal-1', 'admin-1')).rejects.toBeInstanceOf(BadRequestException)

    expect(wallet.credit).toHaveBeenCalledWith('wallet-1', expect.objectContaining({ type: 'WITHDRAWAL_REFUND' }))
    expect(journal.markFailed).toHaveBeenCalled()
  })

  it('renvoie un reversement sans réponse avec la même clé (l\'identifiant de la demande)', async () => {
    const createPayout = vi.fn().mockResolvedValue({ payoutId: 'op_42', reference: null })
    const { service, withdrawal } = buildApproveService(createPayout, new Date(Date.now() - 10 * 60 * 1000))

    await service.retryUnconfirmedPayouts()

    expect(createPayout).toHaveBeenCalledWith(expect.objectContaining({ withdrawalId: 'withdrawal-1' }))
    expect(withdrawal.fedapayPayoutId).toBe('op_42')
  })

  it('n\'insiste plus au-delà de 24 h et ne rend jamais le solde d\'office', async () => {
    const createPayout = vi.fn()
    const { service, wallet } = buildApproveService(createPayout, new Date(Date.now() - 25 * 60 * 60 * 1000))

    await service.retryUnconfirmedPayouts()

    expect(createPayout).not.toHaveBeenCalled()
    expect(wallet.credit).not.toHaveBeenCalled()
  })
})
