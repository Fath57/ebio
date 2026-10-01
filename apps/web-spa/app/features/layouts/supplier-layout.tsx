import { Outlet } from 'react-router'
import { ProtectedRoute } from '@/lib/casl/protected-route'

/** The shop pages: a signed-in buyer or courier has nothing to manage here. */
export default function SupplierLayout() {
  return (
    <ProtectedRoute roles={['SUPPLIER']}>
      <Outlet />
    </ProtectedRoute>
  )
}
