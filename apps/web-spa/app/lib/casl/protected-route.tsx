import type { ReactNode } from 'react'
import type { Actions, Subjects, UserRole } from './ability'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { Navigate } from 'react-router'
import { useAbility } from './ability-context'

interface ProtectedRouteProps {
  children: ReactNode
  roles?: UserRole[]
  action?: Actions
  subject?: Subjects
}

export function ProtectedRoute({ children, roles, action, subject }: ProtectedRouteProps) {
  const { ability, role, isLoading } = useAbility()

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!role || !ability) {
    return <Navigate to="/login" replace />
  }

  if (roles && !roles.includes(role)) {
    return <Navigate to="/unauthorized" replace />
  }

  if (action && subject && !ability.can(action, subject)) {
    return <Navigate to="/unauthorized" replace />
  }

  return <>{children}</>
}
