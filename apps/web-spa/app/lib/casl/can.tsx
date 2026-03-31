import type { ReactNode } from 'react'
import type { Actions, Subjects } from './ability'
import { useAbility } from './ability-context'

interface CanProps {
  action: Actions
  subject: Subjects
  children: ReactNode
  fallback?: ReactNode
}

export function Can({ action, subject, children, fallback = null }: CanProps) {
  const { ability } = useAbility()

  if (!ability || !ability.can(action, subject)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
