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
  const service = new WithdrawalsService(em as never, wallet as never, notifications as never, {} as never)
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
