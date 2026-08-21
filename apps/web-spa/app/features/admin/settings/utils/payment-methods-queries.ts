import {
  paymentMethodAdminControllerCreate,
  paymentMethodAdminControllerList,
  paymentMethodAdminControllerRemove,
  paymentMethodAdminControllerToggleActive,
  paymentMethodAdminControllerUpdate,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export interface PaymentMethodItem {
  id: string
  name: string
  code: string
  type: 'mobile' | 'card'
  provider: 'fedapay' | 'stripe' | 'pawerpayer'
  countryCode: string
  commission: number
  priority: number
  active: boolean
  useFedapayCheckout: boolean
  supportsPayout: boolean
  supportsRefund: boolean
}

export interface PaymentMethodFormData {
  name: string
  code: string
  type: 'mobile' | 'card'
  provider: 'fedapay' | 'stripe' | 'pawerpayer'
  countryCode: string
  commission: number
  priority: number
  active: boolean
  useFedapayCheckout: boolean
  supportsPayout: boolean
  supportsRefund: boolean
}

export function fetchPaymentMethodsQueryOptions() {
  return {
    queryKey: ['admin', 'payment-methods'],
    queryFn: async () => {
      // The route reads its filters via raw @Query, invisible to the OpenAPI
      // spec — the default page size (50) is plenty for a per-country list.
      const response = await paymentMethodAdminControllerList()
      if (response.error)
        throw new Error('Failed to load payment methods')
      return (response.data?.data ?? []) as PaymentMethodItem[]
    },
  }
}

export async function createPaymentMethod(data: PaymentMethodFormData): Promise<void> {
  const response = await paymentMethodAdminControllerCreate({ body: data })
  if (response.error)
    throw new Error('Failed to create payment method')
}

export async function updatePaymentMethod(id: string, data: PaymentMethodFormData): Promise<void> {
  const response = await paymentMethodAdminControllerUpdate({ path: { id }, body: data })
  if (response.error)
    throw new Error('Failed to update payment method')
}

export async function togglePaymentMethod(id: string): Promise<void> {
  const response = await paymentMethodAdminControllerToggleActive({ path: { id } })
  if (response.error)
    throw new Error('Failed to toggle payment method')
}

export async function deletePaymentMethod(id: string): Promise<void> {
  const response = await paymentMethodAdminControllerRemove({ path: { id } })
  if (response.error)
    throw new Error('Failed to delete payment method')
}
