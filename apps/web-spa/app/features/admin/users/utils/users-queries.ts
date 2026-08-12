import { adminControllerGetUsers } from '@boilerstone/openapi-generator/client/sdk.gen'

export interface AdminUserItem {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: string
  emailVerified: boolean
  createdAt: string
  supplierId: string | null
  supplierShopName: string | null
}

export interface AdminUsersPage {
  items: AdminUserItem[]
  total: number
  page: number
  limit: number
}

export interface AdminUsersFilters {
  role?: string
  q?: string
  sortBy?: string
  sortDir?: string
  page?: number
}

export function fetchAdminUsersQueryOptions(filters: AdminUsersFilters = {}) {
  return {
    queryKey: ['admin', 'users', filters],
    queryFn: async () => {
      const response = await adminControllerGetUsers({
        query: {
          role: filters.role ?? '',
          q: filters.q ?? '',
          sortBy: filters.sortBy ?? '',
          sortDir: filters.sortDir ?? '',
          page: String(filters.page ?? 1),
          limit: '20',
        },
      })
      if (response.error)
        throw new Error('Failed to fetch users')
      return response.data as AdminUsersPage
    },
  }
}
