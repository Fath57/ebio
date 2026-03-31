import { useEffect, useState } from 'react'
import { Navigate } from 'react-router'
import { authClient } from '@/lib/auth-client'

export default function HomeRedirect() {
  const { data: session, isPending } = authClient.useSession()
  const [target, setTarget] = useState<string | null>(null)

  useEffect(() => {
    if (isPending)
      return

    if (!session) {
      setTarget('/login')
      return
    }

    const role = (session.user as { role?: string })?.role
    switch (role) {
      case 'ADMIN':
        setTarget('/admin')
        break
      case 'SUPPLIER':
        setTarget('/catalogue')
        break
      default:
        setTarget('/catalogue')
        break
    }
  }, [session, isPending])

  if (isPending || !target)
    return null

  return <Navigate to={target} replace />
}
