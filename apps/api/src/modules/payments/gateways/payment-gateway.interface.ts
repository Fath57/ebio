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
