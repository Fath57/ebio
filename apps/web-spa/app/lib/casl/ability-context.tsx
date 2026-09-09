import type { ReactNode } from 'react'
import type { AppAbility, ServerPermission, UserRole } from './ability'
import { usersControllerGetMe } from '@boilerstone/openapi-generator/client/sdk.gen'
import { useQuery } from '@tanstack/react-query'
import { createContext, use, useMemo } from 'react'
import { authClient } from '@/lib/auth-client'
import { createAbilityForRole, createAbilityFromPermissions } from './ability'

export interface StaffRole {
  id: string
  name: string
}

interface CurrentUser {
  id: string
  role: UserRole
  staffRole: StaffRole | null
  permissions: ServerPermission[]
}

interface AbilityContextValue {
  ability: AppAbility | null
  role: UserRole | null
  /** Permissions granted by the staff role (empty for app users). */
  permissions: ServerPermission[]
  /** Staff role of the current user; `null` for a super administrator or an app user. */
  staffRole: StaffRole | null
  isLoading: boolean
}

const EMPTY_PERMISSIONS: ServerPermission[] = []

const AbilityContext = createContext<AbilityContextValue>({
  ability: null,
  role: null,
  permissions: EMPTY_PERMISSIONS,
  staffRole: null,
  isLoading: true,
})

interface AbilityProviderProps {
  children: ReactNode
}

export function AbilityProvider({ children }: AbilityProviderProps) {
  const { data: session, isPending } = authClient.useSession()
  const role = (session?.user as { role?: UserRole } | undefined)?.role ?? null

  // Staff abilities are server-defined: fetch them once the session says ADMIN.
  const { data: me, isPending: isMePending, isError: isMeError } = useQuery({
    queryKey: ['users', 'me'],
    queryFn: async () => {
      const response = await usersControllerGetMe()
      if (response.error)
        throw new Error('Failed to fetch current user')
      return response.data as unknown as CurrentUser
    },
    enabled: role === 'ADMIN',
  })

  const value = useMemo<AbilityContextValue>(() => {
    if (isPending) {
      return { ability: null, role: null, permissions: EMPTY_PERMISSIONS, staffRole: null, isLoading: true }
    }

    if (!role) {
      return { ability: null, role: null, permissions: EMPTY_PERMISSIONS, staffRole: null, isLoading: false }
    }

    if (role === 'ADMIN') {
      if (isMePending && !isMeError) {
        return { ability: null, role, permissions: EMPTY_PERMISSIONS, staffRole: null, isLoading: true }
      }
      // A failed fetch yields an empty ability rather than an endless loader.
      const permissions = me?.permissions ?? EMPTY_PERMISSIONS
      return {
        ability: createAbilityFromPermissions(permissions),
        role,
        permissions,
        staffRole: me?.staffRole ?? null,
        isLoading: false,
      }
    }

    return {
      ability: createAbilityForRole(role),
      role,
      permissions: EMPTY_PERMISSIONS,
      staffRole: null,
      isLoading: false,
    }
  }, [role, isPending, me, isMePending, isMeError])

  return (
    <AbilityContext value={value}>
      {children}
    </AbilityContext>
  )
}

export function useAbility() {
  const context = use(AbilityContext)
  if (!context) {
    throw new Error('useAbility must be used within an AbilityProvider')
  }
  return context
}
