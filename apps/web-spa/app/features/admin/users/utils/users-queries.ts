import {
  adminControllerGetUsers,
  adminUsersControllerBan,
  adminUsersControllerGetById,
  adminUsersControllerRecentAudit,
  adminUsersControllerReinstate,
  adminUsersControllerSuspend,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED'
export type UserStatusFilter = '' | 'ACTIVE' | 'BLOCKED'

export const USER_ROLE_OPTIONS = ['BUYER', 'SUPPLIER', 'COURIER', 'ADMIN']

export const ROLE_VARIANTS: Record<string, 'default' | 'secondary' | 'outline'> = {
  ADMIN: 'default',
  SUPPLIER: 'secondary',
  COURIER: 'secondary',
  BUYER: 'outline',
}

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
  status: UserStatus
  /** Effective standing: an expired suspension reads as not blocked. */
  isBlocked: boolean
  suspendedUntil: string | null
  statusReason: string | null
  staffRoleName: string | null
  courierId: string | null
  lastLoginAt: string | null
}

export interface AdminUsersPage {
  items: AdminUserItem[]
  total: number
  page: number
  limit: number
}

export interface AdminUsersFilters {
  role?: string
  status?: UserStatusFilter
  q?: string
  sortBy?: string
  sortDir?: string
  page?: number
}

export interface AuditEntry {
  id: string
  action: string
  targetType: string
  targetId: string
  reason: string | null
  payload: Record<string, unknown> | null
  createdAt: string
  actor: { id: string, name: string } | null
}

export interface AdminUserDetail {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: string
  staffRole: { id: string, name: string } | null
  status: UserStatus
  isBlocked: boolean
  statusReason: string | null
  suspendedUntil: string | null
  statusChangedAt: string | null
  statusChangedBy: { id: string, name: string } | null
  emailVerified: boolean
  lastLoginAt: string | null
  createdAt: string
  supplier: { id: string, shopName: string, validationStatus: string } | null
  courier: { id: string, validationStatus: string, isAvailable: boolean } | null
  ordersCount: number
  history: AuditEntry[]
}

function errorMessage(error: unknown, fallback: string) {
  const message = (error as { message?: string } | undefined)?.message
  return message ?? fallback
}

export function fetchAdminUsersQueryOptions(filters: AdminUsersFilters = {}) {
  return {
    queryKey: ['admin', 'users', filters],
    queryFn: async () => {
      const response = await adminControllerGetUsers({
        query: {
          role: filters.role ?? '',
          status: filters.status ?? '',
          q: filters.q ?? '',
          sortBy: filters.sortBy ?? '',
          sortDir: filters.sortDir ?? '',
          page: String(filters.page ?? 1),
          limit: '20',
        },
      })
      if (response.error)
        throw new Error('Failed to fetch users')
      return response.data as unknown as AdminUsersPage
    },
  }
}

export function fetchAdminUserQueryOptions(userId: string) {
  return {
    queryKey: ['admin', 'users', 'detail', userId],
    queryFn: async () => {
      const response = await adminUsersControllerGetById({ path: { id: userId } })
      if (response.error)
        throw new Error('Failed to fetch user')
      return response.data as unknown as AdminUserDetail
    },
  }
}

export function fetchRecentAuditQueryOptions(actorId?: string) {
  return {
    queryKey: ['admin', 'audit', 'recent', actorId ?? ''],
    queryFn: async () => {
      const response = await adminUsersControllerRecentAudit({ query: { actorId: actorId ?? '' } })
      if (response.error)
        throw new Error('Failed to fetch audit entries')
      return response.data as unknown as { entries: AuditEntry[] }
    },
  }
}

export const suspendUserMutationOptions = {
  mutationFn: async ({ id, reason, until }: { id: string, reason: string, until?: Date }) => {
    const response = await adminUsersControllerSuspend({
      path: { id },
      body: { reason, ...(until ? { until } : {}) },
    })
    if (response.error)
      throw new Error(errorMessage(response.error, 'Failed to suspend user'))
    return response.data as unknown as AdminUserDetail
  },
}

export const banUserMutationOptions = {
  mutationFn: async ({ id, reason }: { id: string, reason: string }) => {
    const response = await adminUsersControllerBan({ path: { id }, body: { reason } })
    if (response.error)
      throw new Error(errorMessage(response.error, 'Failed to ban user'))
    return response.data as unknown as AdminUserDetail
  },
}

export const reinstateUserMutationOptions = {
  mutationFn: async ({ id, note }: { id: string, note?: string }) => {
    const response = await adminUsersControllerReinstate({
      path: { id },
      body: note ? { note } : {},
    })
    if (response.error)
      throw new Error(errorMessage(response.error, 'Failed to reinstate user'))
    return response.data as unknown as AdminUserDetail
  },
}
