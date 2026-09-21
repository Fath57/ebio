import { CompensationService } from './compensation.service'
import { CheckoutStatus } from './entities/checkout.entity'

/**
 * Compensation touches money: what is checked here is that it never
 * credits twice, and that it returns what is owed — the order's
 * amount, plus the fee difference of a shortened run.
 */
function buildService(options: { alreadyRefunded?: boolean } = {}) {
  const execute = vi.fn().mockResolvedValue(options.alreadyRefunded ? [{ '?column?': 1 }] : [])
  const orders = [
    { id: 'order-1', status: 'CANCELLED' },
    { id: 'order-2', status: 'PLACED' },
  ]
  const em = {
    findOne: vi.fn(),
    find: vi.fn().mockResolvedValue(orders),
    flush: vi.fn(),
    getConnection: () => ({ execute }),
  }
  const wallet = {
    getOrCreate: vi.fn().mockResolvedValue({ id: 'wallet-1' }),
    credit: vi.fn().mockResolvedValue(0),
  }
  const notifications = { send: vi.fn().mockResolvedValue(undefined) }
  const runHooks = { removeSupplierFromRun: vi.fn().mockResolvedValue(null) }
  const service = new CompensationService(em as never, wallet as never, notifications as never, runHooks as never)
  return { service, em, execute, wallet, notifications, runHooks }
}

function buildOrder(extra: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNumber: 'EB-20260922-001',
    totalAmount: 2600,
    paymentMethod: 'WALLET',
    buyer: { id: 'buyer-1' },
    supplier: { id: 'shop-1' },
    checkout: { id: 'checkout-1' },
    ...extra,
  }
}

describe('compensationService', () => {
  it('crédite le portefeuille du montant exact de la commande', async () => {
    const { service, em, wallet } = buildService()
    em.findOne
      .mockResolvedValueOnce(buildOrder())
      .mockResolvedValueOnce({ id: 'checkout-1', status: CheckoutStatus.PAID, deliveryFee: 800, totalAmount: 6000 })
      .mockResolvedValueOnce(null)

    const result = await service.compensateOrder('order-1', 'rupture de stock')

    expect(result.amount).toBe(2600)
    expect(result.alreadyDone).toBe(false)
    expect(wallet.credit).toHaveBeenCalledWith('wallet-1', expect.objectContaining({
      type: 'REFUND',
      amount: 2600,
      orderId: 'order-1',
    }))
  })

  it('ne crédite pas deux fois la même commande', async () => {
    const { service, em, wallet } = buildService({ alreadyRefunded: true })
    em.findOne
      .mockResolvedValueOnce(buildOrder())
      .mockResolvedValueOnce({ id: 'checkout-1', status: CheckoutStatus.PARTIALLY_REFUNDED })

    const result = await service.compensateOrder('order-1', 'rejeu')

    expect(result.alreadyDone).toBe(true)
    expect(result.amount).toBe(0)
    expect(wallet.credit).not.toHaveBeenCalled()
  })

  it('ne rend rien sur une commande payée en espèces', async () => {
    const { service, em, wallet } = buildService()
    em.findOne
      .mockResolvedValueOnce(buildOrder({ paymentMethod: 'CASH_ON_DELIVERY' }))
      .mockResolvedValueOnce({ id: 'checkout-1', status: CheckoutStatus.PAID })

    const result = await service.compensateOrder('order-1', 'boutique fermée')

    // The money never left the buyer: there is nothing to give back.
    expect(result.amount).toBe(0)
    expect(wallet.credit).not.toHaveBeenCalled()
  })

  it('rend aussi l\'écart de frais quand la tournée raccourcit', async () => {
    const { service, em, wallet, runHooks } = buildService()
    runHooks.removeSupplierFromRun.mockResolvedValue({ runId: 'run-1', refund: 300, remainingShops: 1 })
    const checkout = { id: 'checkout-1', status: CheckoutStatus.PAID, deliveryFee: 800, totalAmount: 6000 }
    em.findOne
      .mockResolvedValueOnce(buildOrder())
      .mockResolvedValueOnce(checkout)
      .mockResolvedValueOnce(null)

    const result = await service.compensateOrder('order-1', 'rupture de stock')

    expect(result.deliveryRefund).toBe(300)
    expect(wallet.credit).toHaveBeenCalledTimes(2)
    // The adjustment carries the run, the order refund does not:
    // that is what keeps one from making the other look already settled.
    const [orderRefund] = wallet.credit.mock.calls[0].slice(1) as [Record<string, unknown>]
    const [feeRefund] = wallet.credit.mock.calls[1].slice(1) as [Record<string, unknown>]
    expect(orderRefund.deliveryRunId).toBeUndefined()
    expect(orderRefund.amount).toBe(2600)
    expect(feeRefund.deliveryRunId).toBe('run-1')
    expect(feeRefund.amount).toBe(300)
    // The cart no longer charges for a ride that will not happen.
    expect(checkout.deliveryFee).toBe(500)
    expect(checkout.totalAmount).toBe(5700)
  })

  it('n\'empêche pas le remboursement quand l\'ajustement des frais échoue', async () => {
    const { service, em, wallet, runHooks } = buildService()
    runHooks.removeSupplierFromRun.mockRejectedValue(new Error('livraisons indisponibles'))
    em.findOne
      .mockResolvedValueOnce(buildOrder())
      .mockResolvedValueOnce({ id: 'checkout-1', status: CheckoutStatus.PAID, deliveryFee: 800, totalAmount: 6000 })
      .mockResolvedValueOnce(null)

    const result = await service.compensateOrder('order-1', 'rupture de stock')

    // The order amount is what the buyer is really waiting for.
    expect(result.amount).toBe(2600)
    expect(result.deliveryRefund).toBe(0)
    expect(wallet.credit).toHaveBeenCalledOnce()
  })

  it('passe le panier en remboursé quand plus aucune commande ne survit', async () => {
    const { service, em } = buildService()
    em.find.mockResolvedValue([
      { id: 'order-1', status: 'CANCELLED' },
      { id: 'order-2', status: 'CANCELLED' },
    ])
    const checkout = { id: 'checkout-1', status: CheckoutStatus.PAID, deliveryFee: 0, totalAmount: 6000 }
    em.findOne
      .mockResolvedValueOnce(buildOrder())
      .mockResolvedValueOnce(checkout)
      .mockResolvedValueOnce(null)

    const result = await service.compensateOrder('order-1', 'tout est tombé')

    expect(result.checkoutStatus).toBe(CheckoutStatus.REFUNDED)
  })

  it('passe le panier en partiellement remboursé quand une commande tient', async () => {
    const { service, em } = buildService()
    const checkout = { id: 'checkout-1', status: CheckoutStatus.PAID, deliveryFee: 0, totalAmount: 6000 }
    em.findOne
      .mockResolvedValueOnce(buildOrder())
      .mockResolvedValueOnce(checkout)
      .mockResolvedValueOnce(null)

    const result = await service.compensateOrder('order-1', 'une seule est tombée')

    expect(result.checkoutStatus).toBe(CheckoutStatus.PARTIALLY_REFUNDED)
  })
})
