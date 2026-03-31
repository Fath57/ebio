import { Outlet } from 'react-router'
import { ProtectedRoute } from '@/lib/casl/protected-route'

export default function AdminLayout() {
  return (
    <ProtectedRoute roles={['ADMIN']}>
      <Outlet />
    </ProtectedRoute>
  )
}
