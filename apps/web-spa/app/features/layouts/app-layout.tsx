import { Header } from '@boilerstone/ui/components/layout/Header'
import { Navigation } from '@boilerstone/ui/components/layout/Navigation'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import {
  Banknote,
  BarChart3,
  Bell,
  CheckCircle,
  ClipboardList,
  CreditCard,
  FolderTree,
  Globe,
  Images,
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

  const isAdmin = ability?.can('manage', 'all') ?? false

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
   * Thirteen admin pages don't fit a flat bar: they fold into groups, each a
   * dropdown in the horizontal menu, a collapsible block in the mobile sheet.
   */
  const adminNavSections = [
    {
      items: [
        { to: '/admin', label: t('nav.dashboard'), icon: <LayoutDashboard className="h-4 w-4" />, end: true },
      ],
    },
    {
      group: { label: t('nav.groups.sales'), icon: <ShoppingCart className="h-4 w-4" /> },
      items: [
        { to: '/admin/commandes', label: t('nav.orders'), icon: <ClipboardList className="h-4 w-4" /> },
        { to: '/admin/transactions', label: t('nav.transactions'), icon: <CreditCard className="h-4 w-4" /> },
        { to: '/admin/commissions', label: t('nav.commissions'), icon: <Percent className="h-4 w-4" /> },
        { to: '/admin/reversements', label: t('nav.withdrawals'), icon: <Banknote className="h-4 w-4" /> },
        { to: '/admin/codes-promo', label: t('nav.promoCodes'), icon: <TicketPercent className="h-4 w-4" /> },
      ],
    },
    {
      group: { label: t('nav.groups.catalog'), icon: <Package className="h-4 w-4" /> },
      items: [
        { to: '/admin/categories', label: t('nav.categories'), icon: <FolderTree className="h-4 w-4" /> },
        { to: '/admin/unites', label: t('nav.productUnits'), icon: <Ruler className="h-4 w-4" /> },
        { to: '/admin/bannieres', label: t('nav.banners'), icon: <Images className="h-4 w-4" /> },
      ],
    },
    {
      group: { label: t('nav.groups.suppliers'), icon: <Store className="h-4 w-4" /> },
      items: [
        { to: '/admin/fournisseurs', label: t('nav.suppliers'), icon: <Store className="h-4 w-4" /> },
        { to: '/admin/validations', label: t('nav.validations'), icon: <CheckCircle className="h-4 w-4" /> },
      ],
    },
    {
      group: { label: t('nav.groups.community'), icon: <Users className="h-4 w-4" /> },
      items: [
        { to: '/admin/utilisateurs', label: t('nav.users'), icon: <Users className="h-4 w-4" /> },
        { to: '/admin/moderation', label: t('nav.moderation'), icon: <ShieldCheck className="h-4 w-4" /> },
      ],
    },
    {
      group: { label: t('nav.groups.config'), icon: <Settings className="h-4 w-4" /> },
      items: [
        { to: '/admin/site', label: t('nav.site'), icon: <Globe className="h-4 w-4" /> },
        { to: '/admin/parametres', label: t('nav.settings'), icon: <Settings className="h-4 w-4" /> },
        { to: '/admin/roles', label: t('nav.roles'), icon: <Shield className="h-4 w-4" /> },
      ],
    },
  ]

  const navSections = isAdmin
    ? adminNavSections
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
