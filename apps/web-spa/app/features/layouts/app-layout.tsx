import type { ReactNode } from 'react'
import type { Actions, Subjects } from '@/lib/casl/ability'
import { Header } from '@boilerstone/ui/components/layout/Header'
import { Navigation } from '@boilerstone/ui/components/layout/Navigation'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import {
  Banknote,
  BarChart3,
  Bell,
  Bike,
  CheckCircle,
  ClipboardList,
  CreditCard,
  FolderTree,
  Globe,
  Images,
  Landmark,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  Package,
  Percent,
  Ruler,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingCart,
  Store,
  Sun,
  TicketPercent,
  Truck,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, Outlet, useNavigate } from 'react-router'
import logoImg from '@/assets/images/logo.png'
import useTheme from '@/hooks/useTheme'
import { authClient } from '@/lib/auth-client'
import { useAbility } from '@/lib/casl/ability-context'

interface NavPermission {
  action: Actions
  subject: Subjects
}

interface AdminNavItem {
  to: string
  label: string
  icon: ReactNode
  end?: boolean
  /** Omitted = visible to every staff member (dashboard). */
  permission?: NavPermission
}

interface AdminNavSection {
  group?: { label: string, icon: ReactNode }
  items: AdminNavItem[]
}

export default function AppLayout() {
  const { t } = useTranslation()
  const { data: session, isPending } = authClient.useSession()
  const { ability, role } = useAbility()
  const navigate = useNavigate()
  const hasLoadedOnce = useRef(false)
  const [theme, resolvedTheme, setTheme] = useTheme()

  const handleLogout = async () => {
    await authClient.signOut()
    navigate('/login')
  }

  const handleThemeToggle = () => {
    if (theme === 'system')
      setTheme('light')
    else if (theme === 'light')
      setTheme('dark')
    else setTheme('system')
  }

  const themeIcon = theme === 'system'
    ? <Monitor className="h-4 w-4" />
    : resolvedTheme === 'dark'
      ? <Moon className="h-4 w-4" />
      : <Sun className="h-4 w-4" />

  const themeLabel = theme === 'system'
    ? t('nav.themeSystem')
    : resolvedTheme === 'dark'
      ? t('nav.themeDark')
      : t('nav.themeLight')

  if (isPending && !hasLoadedOnce.current) {
    return (
      <div className="flex flex-col gap-4 p-8">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!isPending) {
    hasLoadedOnce.current = true
  }

  if (!isPending && !session) {
    return <Navigate to="/login" replace />
  }

  const isAdmin = role === 'ADMIN'

  const supplierNavItems = [
    { to: '/catalogue', label: t('nav.catalogue'), icon: <Package className="h-4 w-4" /> },
    { to: '/commandes', label: t('nav.orders'), icon: <ShoppingCart className="h-4 w-4" /> },
    { to: '/analytics', label: t('nav.analytics'), icon: <BarChart3 className="h-4 w-4" /> },
    { to: '/portefeuille', label: t('nav.wallet'), icon: <Wallet className="h-4 w-4" /> },
    { to: '/codes-promo', label: t('nav.promoCodes'), icon: <TicketPercent className="h-4 w-4" /> },
    { to: '/notifications', label: t('nav.notifications'), icon: <Bell className="h-4 w-4" /> },
    { to: '/parametres', label: t('nav.settings'), icon: <Settings className="h-4 w-4" /> },
  ]

  /**
   * Admin pages don't fit a flat bar: they fold into groups, each a dropdown
   * in the horizontal menu, a collapsible block in the mobile sheet. Each item
   * carries the permission its page requires; the staff member's ability
   * (server-defined) decides what is shown.
   */
  const adminNavSections: AdminNavSection[] = [
    {
      items: [
        { to: '/admin', label: t('nav.dashboard'), icon: <LayoutDashboard className="h-4 w-4" />, end: true },
      ],
    },
    {
      group: { label: t('nav.groups.sales'), icon: <ShoppingCart className="h-4 w-4" /> },
      items: [
        { to: '/admin/commandes', label: t('nav.orders'), icon: <ClipboardList className="h-4 w-4" />, permission: { action: 'read', subject: 'Order' } },
        { to: '/admin/livraisons', label: t('nav.deliveries'), icon: <Truck className="h-4 w-4" />, permission: { action: 'read', subject: 'Delivery' } },
        { to: '/admin/transactions', label: t('nav.transactions'), icon: <CreditCard className="h-4 w-4" />, permission: { action: 'read', subject: 'Payment' } },
        { to: '/admin/commissions', label: t('nav.commissions'), icon: <Percent className="h-4 w-4" />, permission: { action: 'read', subject: 'Payment' } },
        { to: '/admin/comptes', label: t('nav.platformAccounts'), icon: <Landmark className="h-4 w-4" />, permission: { action: 'read', subject: 'Payment' } },
        { to: '/admin/reversements', label: t('nav.withdrawals'), icon: <Banknote className="h-4 w-4" />, permission: { action: 'read', subject: 'Payment' } },
        { to: '/admin/codes-promo', label: t('nav.promoCodes'), icon: <TicketPercent className="h-4 w-4" />, permission: { action: 'manage', subject: 'PromoCode' } },
      ],
    },
    {
      group: { label: t('nav.groups.catalog'), icon: <Package className="h-4 w-4" /> },
      items: [
        { to: '/admin/categories', label: t('nav.categories'), icon: <FolderTree className="h-4 w-4" />, permission: { action: 'manage', subject: 'Category' } },
        { to: '/admin/unites', label: t('nav.productUnits'), icon: <Ruler className="h-4 w-4" />, permission: { action: 'manage', subject: 'ProductUnit' } },
        { to: '/admin/bannieres', label: t('nav.banners'), icon: <Images className="h-4 w-4" />, permission: { action: 'manage', subject: 'Banner' } },
      ],
    },
    {
      group: { label: t('nav.groups.suppliers'), icon: <Store className="h-4 w-4" /> },
      items: [
        { to: '/admin/fournisseurs', label: t('nav.suppliers'), icon: <Store className="h-4 w-4" />, permission: { action: 'read', subject: 'Supplier' } },
        { to: '/admin/validations', label: t('nav.validations'), icon: <CheckCircle className="h-4 w-4" />, permission: { action: 'read', subject: 'Supplier' } },
        { to: '/admin/livreurs', label: t('nav.couriers'), icon: <Bike className="h-4 w-4" />, permission: { action: 'read', subject: 'CourierProfile' } },
      ],
    },
    {
      group: { label: t('nav.groups.community'), icon: <Users className="h-4 w-4" /> },
      items: [
        { to: '/admin/utilisateurs', label: t('nav.users'), icon: <Users className="h-4 w-4" />, permission: { action: 'read', subject: 'User' } },
        { to: '/admin/moderation', label: t('nav.moderation'), icon: <ShieldCheck className="h-4 w-4" />, permission: { action: 'manage', subject: 'ContentReport' } },
      ],
    },
    {
      group: { label: t('nav.groups.config'), icon: <Settings className="h-4 w-4" /> },
      items: [
        { to: '/admin/site', label: t('nav.site'), icon: <Globe className="h-4 w-4" />, permission: { action: 'manage', subject: 'LandingContent' } },
        { to: '/admin/parametres', label: t('nav.settings'), icon: <Settings className="h-4 w-4" />, permission: { action: 'read', subject: 'Settings' } },
        { to: '/admin/equipe', label: t('nav.team'), icon: <UserCog className="h-4 w-4" />, permission: { action: 'manage', subject: 'Staff' } },
        { to: '/admin/roles', label: t('nav.roles'), icon: <Shield className="h-4 w-4" />, permission: { action: 'manage', subject: 'Staff' } },
      ],
    },
  ]

  const canSee = (item: AdminNavItem) =>
    !item.permission || (ability?.can(item.permission.action, item.permission.subject) ?? false)

  const visibleAdminSections = adminNavSections
    .map(section => ({ ...section, items: section.items.filter(canSee) }))
    .filter(section => section.items.length > 0)

  const navSections = isAdmin
    ? visibleAdminSections
    : [{ items: supplierNavItems }]

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-[#141410]">
      <Header>
        <Navigation
          brand={(
            <Link
              to={isAdmin ? '/admin' : '/catalogue'}
              className="flex items-center gap-2 shrink-0"
            >
              <img src={logoImg} alt="eBio" className="h-8 w-auto" />
            </Link>
          )}
          sections={[
            ...navSections,
            {
              separator: true,
              dropdown: {
                icon: <Users className="h-4 w-4" />,
                label: session?.user?.name ?? t('nav.account'),
                header: (
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium leading-none">{session?.user?.name}</p>
                    <p className="text-xs leading-none text-muted-foreground">{session?.user?.email}</p>
                    <Badge variant="secondary" className="mt-1 w-fit text-xs">
                      {role ? t(`userRoles.${role}`) : '—'}
                    </Badge>
                  </div>
                ),
              },
              items: [
                {
                  to: '/profil',
                  label: 'Mon profil',
                  icon: <Users className="h-4 w-4" />,
                },
                {
                  to: '#',
                  label: themeLabel,
                  icon: themeIcon,
                  onClick: handleThemeToggle,
                },
                {
                  to: '#',
                  label: t('nav.logout'),
                  icon: <LogOut className="h-4 w-4" />,
                  onClick: handleLogout,
                  variant: 'destructive' as const,
                  separator: true,
                },
              ],
            },
          ]}
        />
      </Header>
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}
