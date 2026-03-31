import type { ReactNode } from 'react'
import type { Actions, Subjects } from './ability'
import { useAbility } from './ability-context'

interface CanProps {
  action: Actions
  subject: Subjects
  children: ReactNode
  fallback?: ReactNode
}

export function Can({ action, subject, children, fallback = null }: CanProps): ReactNode {
  const { ability } = useAbility()

  if (ability.can(action, subject)) {
    return <>{children}</>
  }

  return <>{fallback}</>
}
