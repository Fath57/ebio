import { Navigate, Outlet, useSearchParams } from 'react-router'
import { SHOP_PARAM } from '@/features/catalog/utils/catalog-scope'
import { useAbility } from '@/lib/casl/ability-context'
import { ProtectedRoute } from '@/lib/casl/protected-route'

/**
 * The catalogue pages: a shop's own, and the product studio staff open on a
 * shop's behalf (`?boutique=`) — the only supplier pages an admin may use.
 * Closing them to anyone but suppliers (2026-10-01) had locked the studio
 * too: the admin product list led to « non autorisé ».
 */
export default function CatalogLayout() {
  const { role, ability } = useAbility()
  const [params] = useSearchParams()

  if (role === 'ADMIN') {
    if (!params.get(SHOP_PARAM) || !ability?.can('manage', 'Product'))
      return <Navigate to="/admin/produits" replace />
    return <Outlet />
  }

  return (
    <ProtectedRoute roles={['SUPPLIER']}>
      <Outlet />
    </ProtectedRoute>
  )
}
