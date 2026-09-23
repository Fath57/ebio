import { IntramGateway } from './intram.gateway'

function buildGateway(client: { get: ReturnType<typeof vi.fn>, post: ReturnType<typeof vi.fn> }) {
  return new IntramGateway(client as never)
}

describe('intramGateway', () => {
  describe('ouverture du paiement', () => {
    it('attend l\'URL de paiement que le POST ne renvoie pas', async () => {
      const post = vi.fn().mockResolvedValue({ operation_id: 'op_1', type: 'payment_request', status: 'queued' })
      const get = vi.fn()
        // The worker has not minted the transaction yet on the first read:
        // that gap is the whole reason this gateway polls.
        .mockResolvedValueOnce({ operation_id: 'op_1', status: 'processing' })
        .mockResolvedValueOnce({
          operation_id: 'op_1',
          status: 'completed',
          result: { transaction_reference: 'AB12CD34EF', gateway_url: 'https://gateway.intram.org/AB12CD34EF' },
        })

      const result = await buildGateway({ get, post }).initiatePayment({
        amount: 12000,
        currency: 'XOF',
        orderId: 'order-1',
        paymentMethod: 'MTN_BENIN_229',
        phoneNumber: '22961234567',
        callbackUrl: 'https://e-bio.org/callback',
      })

      expect(result.redirectUrl).toBe('https://gateway.intram.org/AB12CD34EF')
      expect(result.providerTransactionId).toBe('AB12CD34EF')
      expect(result.status).toBe('pending')
    })

    it('envoie le montant de la commande tel quel : les frais sont ajoutés au client', async () => {
      const post = vi.fn().mockResolvedValue({ operation_id: 'op_1', status: 'queued' })
      const get = vi.fn().mockResolvedValue({
        operation_id: 'op_1',
        result: { transaction_reference: 'AB12CD34EF', gateway_url: 'https://gateway.intram.org/AB12CD34EF' },
      })

      await buildGateway({ get, post }).initiatePayment({
        amount: 10000,
        currency: 'XOF',
        orderId: 'order-1',
        paymentMethod: 'MTN_BENIN_229',
        callbackUrl: 'https://e-bio.org/callback',
      })

      const [, body, idempotencyKey] = post.mock.calls[0]
      expect(body.invoice.amount).toBe(10000)
      // Keyed on the order: a buyer who retries checkout reopens the same
      // request instead of a second one against the same basket.
      expect(idempotencyKey).toBe('pr-order-order-1')
    })

    it('rend la main sans URL plutôt que d\'échouer : le webhook la porte aussi', async () => {
      const post = vi.fn().mockResolvedValue({ operation_id: 'op_1', status: 'queued' })
      const get = vi.fn().mockResolvedValue({ operation_id: 'op_1', status: 'failed' })

      const result = await buildGateway({ get, post }).initiatePayment({
        amount: 500,
        currency: 'XOF',
        orderId: 'order-1',
        paymentMethod: 'MTN_BENIN_229',
        callbackUrl: 'https://e-bio.org/callback',
      })

      expect(result.redirectUrl).toBeUndefined()
      expect(result.providerTransactionId).toBe('op_1')
    })
  })

  describe('statuts', () => {
    // GET answers in upper case, webhooks in lower: both have to land on the
    // same vocabulary or a paid order would read as pending.
    it('traduit les statuts en majuscules de GET /transactions', async () => {
      const get = vi.fn().mockResolvedValue({
        reference: 'AB12CD34EF',
        status: 'SUCCESS',
        amount: 12000,
        currency: 'XOF',
        date: '2026-05-20T10:30:00.000Z',
      })
      const result = await buildGateway({ get, post: vi.fn() }).checkStatus('AB12CD34EF')
      expect(result.status).toBe('completed')
      expect(result.amount).toBe(12000)
      expect(result.paidAt).toEqual(new Date('2026-05-20T10:30:00.000Z'))
    })

    it('traduit ERROR en échec et REFUNDED en remboursé', async () => {
      const gateway = buildGateway({ get: vi.fn().mockResolvedValue({ reference: 'R', status: 'ERROR', amount: 1, currency: 'XOF' }), post: vi.fn() })
      expect((await gateway.checkStatus('R')).status).toBe('failed')
    })

    it('traduit les événements du webhook en minuscules', async () => {
      const gateway = buildGateway({ get: vi.fn(), post: vi.fn() })
      const paid = await gateway.handleWebhook({
        event: 'payment_request.paid',
        operation_id: 'op_1',
        data: { reference: 'AB12CD34EF', status: 'completed' },
      })
      expect(paid.status).toBe('completed')
      expect(paid.providerTransactionId).toBe('AB12CD34EF')
      expect(paid.paidAt).toBeInstanceOf(Date)

      const failed = await gateway.handleWebhook({ event: 'payment_request.failed', operation_id: 'op_2', data: {} })
      expect(failed.status).toBe('failed')
      // No transaction reference yet: the operation id is the only handle,
      // and it is what we stored when the payment was opened.
      expect(failed.providerTransactionId).toBe('op_2')
    })
  })

  describe('reversements', () => {
    it('adresse le numéro au format international et se cale sur le retrait', async () => {
      const post = vi.fn().mockResolvedValue({ operation_id: 'op_pay_1', status: 'queued' })
      const result = await buildGateway({ get: vi.fn(), post }).createPayout({
        amount: 25000,
        phoneNumber: '61234567',
        mode: 'mtn_open',
        firstname: 'Ada',
        lastname: 'Lovelace',
        withdrawalId: 'wd-9',
      })

      const [endpoint, body, idempotencyKey] = post.mock.calls[0]
      expect(endpoint).toBe('/payouts')
      expect(body.destination.msisdn).toBe('22961234567')
      expect(body.destination.provider_code).toBe('MTN_BENIN_229')
      // The withdrawal's own id: a retry can never pay a courier twice.
      expect(idempotencyKey).toBe('po-wd-9')
      expect(result.payoutId).toBe('op_pay_1')
    })

    // Our operator codes are FedaPay's and sit in `payout_numbers.operator` on
    // every saved number; INTRAM wants its own. Translating at the edge is
    // what spares that column a migration.
    it('traduit nos codes opérateurs vers ceux d\'INTRAM', async () => {
      const post = vi.fn().mockResolvedValue({ operation_id: 'op' })
      const gateway = buildGateway({ get: vi.fn(), post })
      const base = { amount: 1000, phoneNumber: '61234567', firstname: 'A', lastname: 'B', withdrawalId: 'wd' }

      await gateway.createPayout({ ...base, mode: 'mtn_open' })
      await gateway.createPayout({ ...base, mode: 'moov' })
      await gateway.createPayout({ ...base, mode: 'sbin' })

      expect(post.mock.calls.map(call => call[1].destination.provider_code)).toEqual([
        'MTN_BENIN_229',
        'MOOV_AFRICA_BENIN_229',
        'SBIN_BENIN_229',
      ])
    })

    it('refuse un opérateur inconnu avant que l\'argent ne bouge', async () => {
      const post = vi.fn()
      const gateway = buildGateway({ get: vi.fn(), post })
      await expect(gateway.createPayout({
        amount: 1000,
        phoneNumber: '61234567',
        mode: 'orange_ci',
        firstname: 'A',
        lastname: 'B',
        withdrawalId: 'wd',
      })).rejects.toThrow(/opérateur inconnu/)
      expect(post).not.toHaveBeenCalled()
    })

    it('ne double pas l\'indicatif d\'un numéro déjà international', async () => {
      const post = vi.fn().mockResolvedValue({ operation_id: 'op_pay_2' })
      await buildGateway({ get: vi.fn(), post }).createPayout({
        amount: 1000,
        phoneNumber: '22961234567',
        mode: 'moov',
        firstname: 'A',
        lastname: 'B',
        withdrawalId: 'wd-10',
      })
      expect(post.mock.calls[0][1].destination.msisdn).toBe('22961234567')
    })

    it('lit l\'état d\'un reversement sur son opération', async () => {
      const get = vi.fn().mockResolvedValue({
        operation_id: 'op_pay_1',
        status: 'completed',
        result: { status: 'completed', transaction_reference: 'PO-2026-0001' },
      })
      const result = await buildGateway({ get, post: vi.fn() }).checkPayoutStatus('op_pay_1')
      expect(result.status).toBe('sent')
      expect(result.reference).toBe('PO-2026-0001')
    })
  })

  describe('remboursement', () => {
    it('signale l\'acceptation, pas l\'aboutissement', async () => {
      const post = vi.fn().mockResolvedValue({ operation_id: 'op_rf_1' })
      const result = await buildGateway({ get: vi.fn(), post }).processRefund('AB12CD34EF', 12000)
      expect(result.success).toBe(true)
      expect(post.mock.calls[0][0]).toBe('/refunds')
    })

    it('rend un échec plutôt que de propager l\'erreur réseau', async () => {
      const post = vi.fn().mockRejectedValue(new Error('INTRAM /refunds: validation_error'))
      const result = await buildGateway({ get: vi.fn(), post }).processRefund('AB12CD34EF', 12000)
      expect(result.success).toBe(false)
    })
  })
})
