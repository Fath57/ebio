import { FedaPayGateway } from './fedapay.gateway'
import { PawerPayerGateway } from './pawerpayer.gateway'

/**
 * Neither provider signs its webhooks: anyone can POST one. The body may only
 * name the transaction, the status has to come back from the provider.
 */
describe('webhooks non signés', () => {
  it('fedaPay : un « approved » forgé ne vaut pas paiement', async () => {
    const gateway = new FedaPayGateway()
    const checkStatus = vi.spyOn(gateway, 'checkStatus').mockResolvedValue({ status: 'pending' })

    const result = await gateway.handleWebhook({ entity: { id: 42, status: 'approved' } })

    expect(checkStatus).toHaveBeenCalledWith('42')
    expect(result).toEqual({ providerTransactionId: '42', status: 'pending', paidAt: undefined })
  })

  it('pawerPayer : un « success » forgé ne vaut pas paiement', async () => {
    const gateway = new PawerPayerGateway()
    const checkStatus = vi.spyOn(gateway, 'checkStatus').mockResolvedValue({ status: 'failed' })

    const result = await gateway.handleWebhook({ transaction_id: 'tx-1', status: 'success' })

    expect(checkStatus).toHaveBeenCalledWith('tx-1')
    expect(result).toEqual({ providerTransactionId: 'tx-1', status: 'failed', paidAt: undefined })
  })
})
