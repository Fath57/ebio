import type { Actions, Subjects } from '@/lib/casl/ability'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAbility } from '@/lib/casl/ability-context'
import { ProtectedRoute } from '@/lib/casl/protected-route'

interface RoutePermission {
  prefix: string
  action: Actions
  subject: Subjects
}

/**
 * Permission required to open each admin area. The longest matching prefix
 * wins; `/admin` alone (dashboard) is open to every staff member.
 */
const ROUTE_PERMISSIONS: RoutePermission[] = [
  { prefix: '/admin/commandes', action: 'read', subject: 'Order' },
  { prefix: '/admin/livraisons', action: 'read', subject: 'Delivery' },
  { prefix: '/admin/transactions', action: 'read', subject: 'Payment' },
  { prefix: '/admin/commissions', action: 'read', subject: 'Payment' },
  { prefix: '/admin/comptes', action: 'read', subject: 'Payment' },
  { prefix: '/admin/reversements', action: 'read', subject: 'Payment' },
  { prefix: '/admin/codes-promo', action: 'manage', subject: 'PromoCode' },
  { prefix: '/admin/categories', action: 'manage', subject: 'Category' },
  { prefix: '/admin/unites', action: 'manage', subject: 'ProductUnit' },
  { prefix: '/admin/bannieres', action: 'manage', subject: 'Banner' },
  { prefix: '/admin/fournisseurs', action: 'read', subject: 'Supplier' },
  { prefix: '/admin/validations', action: 'read', subject: 'Supplier' },
  { prefix: '/admin/livreurs', action: 'read', subject: 'CourierProfile' },
  { prefix: '/admin/moderation', action: 'manage', subject: 'ContentReport' },
  { prefix: '/admin/utilisateurs', action: 'read', subject: 'User' },
  { prefix: '/admin/roles', action: 'manage', subject: 'Staff' },
  { prefix: '/admin/equipe', action: 'manage', subject: 'Staff' },
  { prefix: '/admin/site', action: 'manage', subject: 'LandingContent' },
  { prefix: '/admin/parametres', action: 'read', subject: 'Settings' },
]

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function findRoutePermission(pathname: string): RoutePermission | null {
  let best: RoutePermission | null = null
  for (const entry of ROUTE_PERMISSIONS) {
    if (matchesPrefix(pathname, entry.prefix) && (!best || entry.prefix.length > best.prefix.length))
      best = entry
  }
  return best
}

function AdminRouteGuard() {
  const { pathname } = useLocation()
  const { ability } = useAbility()
  const required = findRoutePermission(pathname)

  if (required && !ability?.can(required.action, required.subject))
    return <Navigate to="/unauthorized" replace />

  return <Outlet />
}

export default function AdminLayout() {
  return (
    <ProtectedRoute roles={['ADMIN']}>
      <AdminRouteGuard />
    </ProtectedRoute>
  )
}
