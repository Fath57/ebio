export interface InitiatePaymentParams {
  amount: number
  currency: string
  orderId: string
  paymentMethod: string
  phoneNumber?: string
  callbackUrl: string
}

export interface InitiatePaymentResult {
  redirectUrl?: string
  clientSecret?: string
  providerTransactionId: string
  status: string
}

export interface CheckStatusResult {
  status: string
  paidAt?: Date
  reference?: string
  providerPaymentMethodId?: string
  /** Amount FedaPay actually charged — never trust the client's number. */
  amount?: number
}

export interface RefundResult {
  success: boolean
}

export interface WebhookResult {
  providerTransactionId: string
  status: string
  paidAt?: Date
}

export interface PaymentGatewayInterface {
  initiatePayment: (params: InitiatePaymentParams) => Promise<InitiatePaymentResult>
  checkStatus: (providerTransactionId: string) => Promise<CheckStatusResult>
  processRefund: (providerTransactionId: string, amount: number) => Promise<RefundResult>
  handleWebhook: (payload: unknown, signature?: string) => Promise<WebhookResult>
}

export interface CreatePayoutParams {
  amount: number
  /** Local or international Benin number; each gateway formats its own. */
  phoneNumber: string
  /** Our internal operator code (`mtn_open` | `moov` | `sbin`). */
  mode: string
  firstname: string
  lastname: string
  email?: string
  withdrawalId: string
}

export interface PayoutStatusResult {
  status: 'pending' | 'sent' | 'failed'
  reference: string | null
  errorMessage: string | null
}

/**
 * Sending money out — a courier's earnings, a shop's withdrawal.
 *
 * Kept apart from `PaymentGatewayInterface` because not every provider can do
 * it: Stripe and PawaPay are only ever asked to take money in. Withdrawals
 * ask the factory for this capability, so a provider that lacks it is refused
 * at the door rather than failing at the moment of paying someone.
 *
 * `mode` is our own operator code, not the provider's: each implementation
 * translates it, so the value stored on a payout number never has to be
 * migrated when the provider changes.
 */
export interface PayoutGatewayInterface {
  createPayout: (params: CreatePayoutParams) => Promise<{ payoutId: string, reference: string | null }>
  checkPayoutStatus: (payoutId: string) => Promise<PayoutStatusResult>
}
