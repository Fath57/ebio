import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { AdminUserItem, UserStatusFilter } from '../utils/users-queries'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { useServerSorting } from '@/features/admin/common/utils/use-server-sorting'
import { UserStatusBadge } from '../components/user-status-badge'
import { fetchAdminUsersQueryOptions, ROLE_VARIANTS, USER_ROLE_OPTIONS } from '../utils/users-queries'

const PAGE_SIZE = 20

const STATUS_OPTIONS: Array<{ value: UserStatusFilter, labelKey: string }> = [
  { value: '', labelKey: 'admin.users.status.filterAll' },
  { value: 'ACTIVE', labelKey: 'admin.users.status.filterActive' },
  { value: 'BLOCKED', labelKey: 'admin.users.status.filterBlocked' },
]

export default function AdminUsersPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState<UserStatusFilter>('')
  const [page, setPage] = useState(1)
  const resetPage = useCallback(() => setPage(1), [])
  const { sorting, setSorting, sortBy, sortDir } = useServerSorting('createdAt', resetPage)

  const { data, isLoading } = useQuery(
    fetchAdminUsersQueryOptions({
      q: search || undefined,
      role: role || undefined,
      status,
      sortBy,
      sortDir,
      page,
    }),
  )

  const columns = useMemo<Array<ColumnDef<AdminUserItem, unknown>>>(() => [
    {
      id: 'name',
      header: t('admin.users.columns.name'),
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      id: 'email',
      header: t('admin.users.columns.email'),
      cell: ({ row }) => (
        <>
          <span className={row.original.emailVerified ? '' : 'text-muted-foreground'}>
            {row.original.email ?? '—'}
          </span>
          {row.original.email && !row.original.emailVerified && (
            <Badge variant="outline" className="ml-2">
              {t('admin.users.unverified')}
            </Badge>
          )}
        </>
      ),
    },
    {
      id: 'phone',
      header: t('admin.users.columns.phone'),
      enableSorting: false,
      cell: ({ row }) => row.original.phone ?? '—',
    },
    {
      id: 'role',
      header: t('admin.users.columns.role'),
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-1">
          <Badge variant={ROLE_VARIANTS[row.original.role] ?? 'outline'}>
            {t(`admin.users.role.${row.original.role}`)}
          </Badge>
          {row.original.staffRoleName && (
            <span className="text-xs text-muted-foreground">{row.original.staffRoleName}</span>
          )}
        </span>
      ),
    },
    {
      id: 'status',
      header: t('admin.users.columns.status'),
      enableSorting: false,
      cell: ({ row }) => (
        <UserStatusBadge
          status={row.original.status}
          isBlocked={row.original.isBlocked}
          suspendedUntil={row.original.suspendedUntil}
        />
      ),
    },
    {
      id: 'shop',
      header: t('admin.users.columns.shop'),
      enableSorting: false,
      // Raccourci vers la fiche fournisseur quand le compte en a une.
      cell: ({ row }) => (row.original.supplierId
        ? (
            <Link
              className="text-primary underline-offset-4 hover:underline"
              to={`/admin/fournisseurs/${row.original.supplierId}`}
              onClick={event => event.stopPropagation()}
            >
              {row.original.supplierShopName}
            </Link>
          )
        : '—'),
    },
    {
      id: 'createdAt',
      header: t('admin.users.columns.since'),
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(i18n.language),
    },
  ], [t, i18n.language])

  return (
    <AdminListShell
      title={t('admin.users.title')}
      description={t('admin.users.description')}
      searchValue={search}
      onSearchChange={(value) => {
        setSearch(value)
        setPage(1)
      }}
      searchPlaceholder={t('admin.users.searchPlaceholder')}
      filters={(
        <>
          <select
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            value={role}
            aria-label={t('admin.users.columns.role')}
            onChange={(event) => {
              setRole(event.target.value)
              setPage(1)
            }}
          >
            <option value="">{t('admin.users.allRoles')}</option>
            {USER_ROLE_OPTIONS.map(value => (
              <option key={value} value={value}>
                {t(`admin.users.role.${value}`)}
              </option>
            ))}
          </select>
          <select
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            value={status}
            aria-label={t('admin.users.columns.status')}
            onChange={(event) => {
              setStatus(event.target.value as UserStatusFilter)
              setPage(1)
            }}
          >
            {STATUS_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </>
      )}
      columns={columns}
      data={data?.items ?? []}
      total={data?.total ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      onPageChange={setPage}
      sorting={sorting}
      onSortingChange={setSorting}
      onRowClick={user => navigate(`/admin/utilisateurs/${user.id}`)}
      isLoading={isLoading}
      emptyLabel={t('admin.users.empty')}
    />
  )
}
