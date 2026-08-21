import { client } from '@boilerstone/openapi-generator'

export interface CommissionTotals {
  realizedCommission: number
  realizedBase: number
  deliveredOrders: number
  pendingCommission: number
  pendingOrders: number
}

export interface CommissionSupplierRow {
  supplierId: string
  shopName: string
  negotiatedRate: number | null
  deliveredOrders: number
  realizedBase: number
  realizedCommission: number
  pendingCommission: number
}

export interface CommissionSummary {
  totals: CommissionTotals
  suppliers: CommissionSupplierRow[]
  total: number
  page: number
  limit: number
}

export interface CommissionOrderRow {
  id: string
  date: string
  orderNumber: string
  supplierName: string
  status: string
  base: number
  rate: number
  commission: number
}

export interface CommissionOrdersPage {
  items: CommissionOrderRow[]
  total: number
  page: number
  limit: number
}

export interface CommissionFilters {
  from?: string
  to?: string
  supplierId?: string
}

function filterParams(filters: CommissionFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.from)
    params.set('from', filters.from)
  if (filters.to)
    params.set('to', filters.to)
  if (filters.supplierId)
    params.set('supplierId', filters.supplierId)
  return params
}

export function fetchCommissionsQueryOptions(filters: CommissionFilters, page: number) {
  return {
    queryKey: ['admin', 'commissions', filters, page],
    queryFn: async () => {
      const params = filterParams(filters)
      params.set('page', String(page))
      // No typed response on this route — fallback to client
      const result = await client.get({ url: `/api/admin/commissions?${params.toString()}` })
      return result.data as CommissionSummary
    },
  }
}

export function fetchCommissionOrdersQueryOptions(filters: CommissionFilters, page: number) {
  return {
    queryKey: ['admin', 'commissions', 'orders', filters, page],
    queryFn: async () => {
      const params = filterParams(filters)
      params.set('page', String(page))
      const result = await client.get({ url: `/api/admin/commissions/orders?${params.toString()}` })
      return result.data as CommissionOrdersPage
    },
  }
}

export function exportCommissionsCsvUrl(filters: CommissionFilters): string {
  const params = filterParams(filters)
  params.set('format', 'csv')
  return `/api/admin/commissions/orders?${params.toString()}`
}
