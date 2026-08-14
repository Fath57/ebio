import {
  adminControllerGetDisputes,
  adminControllerGetPayments,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export interface PaymentItem {
  id: string
  orderId: string | null
  orderNumber: string | null
  buyerName: string
  supplierName: string
  amount: number
  /** Commission eBio — nulle tant que le séquestre n'est pas libéré. */
  commission: number
  provider: string
  providerReference: string | null
  paymentMethod: string | null
  operator: string | null
  status: string
  paidAt: string | null
  releasedAt: string | null
  refundedAt: string | null
  createdAt: string
}

export interface PaymentTotals {
  /** Somme réellement encaissée : capturé, sous séquestre ou libéré. */
  collected: number
  /** Retenu par la plateforme, donc dû aux fournisseurs. */
  inEscrow: number
  /** Acquis à eBio, uniquement sur les paiements libérés. */
  commissionEarned: number
  refunded: number
}

export interface PaymentsPage {
  items: PaymentItem[]
  total: number
  page: number
  limit: number
  totals: PaymentTotals
}

export interface PaymentFilters {
  status?: string
  provider?: string
  q?: string
  from?: string
  to?: string
  page?: number
}

export function fetchPaymentsQueryOptions(filters: PaymentFilters = {}) {
  return {
    queryKey: ['admin', 'payments', filters],
    queryFn: async () => {
      const response = await adminControllerGetPayments({
        query: {
          status: filters.status ?? '',
          provider: filters.provider ?? '',
          q: filters.q ?? '',
          from: filters.from ?? '',
          to: filters.to ?? '',
          format: 'json',
          page: String(filters.page ?? 1),
          limit: '20',
        },
      })
      if (response.error)
        throw new Error('Failed to fetch payments')
      return response.data as PaymentsPage
    },
  }
}

export interface DisputeItem {
  id: string
  status: string
  reason: string
  amount: number
}

export function fetchDisputesQueryOptions() {
  return {
    queryKey: ['admin', 'disputes'],
    queryFn: async () => {
      const response = await adminControllerGetDisputes({
        query: { status: '', page: '1', limit: '50' },
      })
      if (response.error)
        throw new Error('Failed to fetch disputes')
      // L'API pagine sous `items` — l'ancien code lisait `data`, d'où une liste
      // toujours vide.
      return response.data as { items: DisputeItem[], total: number }
    },
  }
}

/** Export CSV : le format est un paramètre de la route, pas un sous-chemin. */
export function exportPaymentsCsvUrl(filters: PaymentFilters = {}): string {
  const params = new URLSearchParams({ format: 'csv' })
  if (filters.status)
    params.set('status', filters.status)
  if (filters.provider)
    params.set('provider', filters.provider)
  if (filters.q)
    params.set('q', filters.q)
  if (filters.from)
    params.set('from', filters.from)
  if (filters.to)
    params.set('to', filters.to)
  return `/api/admin/payments?${params.toString()}`
}
