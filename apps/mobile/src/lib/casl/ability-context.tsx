import type { ReactNode } from 'react'
import type { Actions, AppAbility, Subjects } from './ability'
import { createContext, use, useEffect, useState } from 'react'
import { apiFetch } from '../../utils/api-client'
import { createAbilityForRole } from './ability'

interface AuthUser {
  id: string
  name: string
  role: string
  permissions?: Array<{ action: string, subject: string }>
}

interface AbilityContextValue {
  ability: AppAbility
  user: AuthUser | null
  loading: boolean
  isAuthenticated: boolean
}

const AbilityContext = createContext<AbilityContextValue>({
  ability: createAbilityForRole('BUYER'),
  user: null,
  loading: true,
  isAuthenticated: false,
})

export function AbilityProvider({ children }: { children: ReactNode }): ReactNode {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [ability, setAbility] = useState<AppAbility>(createAbilityForRole('BUYER'))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadUser()
  }, [])

  async function loadUser(): Promise<void> {
    try {
      const res = await apiFetch('/api/users/me')
      if (res.ok) {
        const data: AuthUser = await res.json()
        setUser(data)
        setAbility(createAbilityForRole(data.role))
      }
    }
    catch {
      /* not authenticated */
    }
    finally {
      setLoading(false)
    }
  }

  return (
    <AbilityContext value={{ ability, user, loading, isAuthenticated: !!user }}>
      {children}
    </AbilityContext>
  )
}

export function useAbility(): AbilityContextValue {
  return use(AbilityContext)
}

export type { Actions, AuthUser, Subjects }
