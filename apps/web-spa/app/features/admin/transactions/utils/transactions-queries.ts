import {
  adminControllerGetDisputes,
  adminControllerGetTransactions,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export interface TransactionItem {
  id: string
  reference: string
  buyerName: string
  supplierName: string
  amount: number
  commission: number
  createdAt: string
  status: string
}

export interface TransactionsData {
  data: TransactionItem[]
}

export interface DisputeItem {
  id: string
  status: string
  reason: string
  amount: number
}

export interface DisputesData {
  data: DisputeItem[]
}

export function fetchTransactionsQueryOptions(params?: { from?: string, to?: string }) {
  return {
    queryKey: ['admin', 'transactions', params],
    queryFn: async () => {
      const response = await adminControllerGetTransactions({
        query: {
          from: params?.from ?? '',
          to: params?.to ?? '',
          format: '',
          page: '1',
          limit: '50',
        },
      })
      if (response.error)
        throw new Error('Failed to fetch transactions')
      return response.data as TransactionsData
    },
  }
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
      return response.data as DisputesData
    },
  }
}

export function exportTransactionsCsvUrl(params?: { from?: string, to?: string }) {
  const searchParams = new URLSearchParams()
  if (params?.from)
    searchParams.set('from', params.from)
  if (params?.to)
    searchParams.set('to', params.to)
  const query = searchParams.toString()
  return `/api/admin/transactions/export${query ? `?${query}` : ''}`
}
