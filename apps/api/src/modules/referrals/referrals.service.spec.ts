import { ReferralStatus } from './referral.entity'
import { ReferralsService } from './referrals.service'

/**
 * Le versement touche à l'argent : on vérifie qu'il ne part qu'une fois, et
 * que la ligne ne passe « récompensée » que dans la même transaction que les
 * crédits.
 */
function buildService(options: { isClaimed?: boolean } = {}) {
  const referral = {
    id: 'referral-1',
    status: ReferralStatus.PENDING,
    sponsor: { id: 'sponsor-1', name: 'Koffi' },
    referee: { id: 'referee-1', name: 'Amina' },
  }
  const execute = vi.fn().mockResolvedValue({ affectedRows: options.isClaimed === false ? 0 : 1 })
  const em = {
    findOne: vi.fn().mockResolvedValue(referral),
    execute,
    transactional: vi.fn(),
  }
  em.transactional.mockImplementation(async (work: (txEm: typeof em) => Promise<unknown>) => work(em))
  const wallet = {
    getOrCreate: vi.fn().mockImplementation(async ({ userId }: { userId: string }) => ({ id: `wallet-${userId}` })),
    credit: vi.fn().mockResolvedValue(0),
    post: vi.fn().mockResolvedValue(undefined),
  }
  const settings = {
    getReferralRewards: vi.fn().mockResolvedValue({ active: true, minOrderAmount: 0, sponsorAmount: 1000, refereeAmount: 500 }),
  }
  const notifications = { send: vi.fn().mockResolvedValue(undefined) }
  const service = new ReferralsService(em as never, wallet as never, settings as never, notifications as never)
  return { service, em, execute, wallet, notifications }
}

describe('versement du parrainage', () => {
  it('crédite les deux portefeuilles dans la transaction qui marque la récompense', async () => {
    const { service, em, execute, wallet } = buildService()

    await service.onOrderDelivered('order-1', 'referee-1', 5000)

    expect(em.transactional).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE referrals'),
      [ReferralStatus.REWARDED, 1000, 500, 'order-1', 'referral-1', ReferralStatus.PENDING],
      'run',
    )
    expect(wallet.credit).toHaveBeenCalledWith('wallet-sponsor-1', expect.objectContaining({ amount: 1000 }))
    expect(wallet.credit).toHaveBeenCalledWith('wallet-referee-1', expect.objectContaining({ amount: 500 }))
    expect(wallet.post).toHaveBeenCalledOnce()
  })

  it('ne verse rien quand une autre livraison a déjà réclamé la récompense', async () => {
    const { service, wallet, notifications } = buildService({ isClaimed: false })

    await service.onOrderDelivered('order-1', 'referee-1', 5000)

    expect(wallet.credit).not.toHaveBeenCalled()
    expect(notifications.send).not.toHaveBeenCalled()
  })

  it('ne prévient personne quand un crédit échoue', async () => {
    const { service, wallet, notifications } = buildService()
    wallet.credit.mockRejectedValueOnce(new Error('portefeuille indisponible'))

    await expect(service.onOrderDelivered('order-1', 'referee-1', 5000)).resolves.toBeUndefined()

    expect(notifications.send).not.toHaveBeenCalled()
  })
})
