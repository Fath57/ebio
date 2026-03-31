import type { ReactNode } from 'react'
import type { AppAbility, UserRole } from './ability'
import { createContext, use, useMemo } from 'react'
import { authClient } from '@/lib/auth-client'
import { createAbilityForRole } from './ability'

interface AbilityContextValue {
  ability: AppAbility | null
  role: UserRole | null
  isLoading: boolean
}

const AbilityContext = createContext<AbilityContextValue>({
  ability: null,
  role: null,
  isLoading: true,
})

interface AbilityProviderProps {
  children: ReactNode
}

export function AbilityProvider({ children }: AbilityProviderProps) {
  const { data: session, isPending } = authClient.useSession()

  const value = useMemo<AbilityContextValue>(() => {
    if (isPending) {
      return { ability: null, role: null, isLoading: true }
    }

    const role = (session?.user as { role?: UserRole } | undefined)?.role ?? null

    if (!role) {
      return { ability: null, role: null, isLoading: false }
    }

    return {
      ability: createAbilityForRole(role),
      role,
      isLoading: false,
    }
  }, [session, isPending])

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
