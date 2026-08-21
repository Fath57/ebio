import {
  adminControllerGetSupplierById,
  adminControllerGetSuppliers,
  adminControllerReinstateSupplier,
  adminControllerSuspendSupplier,
  adminControllerUpdateSupplierCommissionRate,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export interface AdminSupplierOwner {
  id: string | null
  name: string
  email: string | null
  phone: string | null
}

export interface AdminSupplierListItem {
  id: string
  shopName: string
  type: string
  mode: string
  validationStatus: string
  timezone: string
  address: string | null
  neighborhood: string | null
  latitude: number | null
  longitude: number | null
  rating: number | null
  reviewCount: number
  productCount: number
  orderCount: number
  createdAt: string
  owner: AdminSupplierOwner
}

export interface AdminSupplierDetail extends AdminSupplierListItem {
  openingHours: Record<string, { open?: string, close?: string, closed?: boolean }> | null
  coverPhoto: string | null
  profilePhoto: string | null
  mobileMoneyNumber: string | null
  commissionRate: number | null
  revenue: number
}

export interface AdminSuppliersPage {
  items: AdminSupplierListItem[]
  total: number
  page: number
  limit: number
}

export interface AdminSuppliersFilters {
  status?: string
  q?: string
  sortBy?: string
  sortDir?: string
  page?: number
}

export function fetchAdminSuppliersQueryOptions(filters: AdminSuppliersFilters = {}) {
  return {
    queryKey: ['admin', 'suppliers', filters],
    queryFn: async () => {
      const response = await adminControllerGetSuppliers({
        query: {
          status: filters.status ?? '',
          q: filters.q ?? '',
          sortBy: filters.sortBy ?? '',
          sortDir: filters.sortDir ?? '',
          page: String(filters.page ?? 1),
          limit: '20',
        },
      })
      if (response.error)
        throw new Error('Failed to fetch suppliers')
      return response.data as AdminSuppliersPage
    },
  }
}

export function fetchAdminSupplierQueryOptions(supplierId: string) {
  return {
    queryKey: ['admin', 'suppliers', supplierId],
    queryFn: async () => {
      const response = await adminControllerGetSupplierById({ path: { id: supplierId } })
      if (response.error)
        throw new Error('Failed to fetch supplier')
      return response.data as AdminSupplierDetail
    },
  }
}

export async function suspendSupplier(supplierId: string, reason: string): Promise<void> {
  const response = await adminControllerSuspendSupplier({
    path: { id: supplierId },
    body: { reason },
  })
  if (response.error)
    throw new Error('Failed to suspend supplier')
}

export async function reinstateSupplier(supplierId: string): Promise<void> {
  const response = await adminControllerReinstateSupplier({ path: { id: supplierId } })
  if (response.error)
    throw new Error('Failed to reinstate supplier')
}

/** Fraction (0.03 = 3 %) ; null revient à la grille par catégorie. */
export async function updateSupplierCommissionRate(supplierId: string, rate: number | null): Promise<void> {
  const response = await adminControllerUpdateSupplierCommissionRate({
    path: { id: supplierId },
    body: { rate },
  })
  if (response.error)
    throw new Error('Failed to update commission rate')
}
