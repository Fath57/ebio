import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { AdminUserItem, UserStatusFilter } from '../utils/users-queries'
import type { ActiveFilter } from '@/features/admin/common/components/admin-list-shell'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { FilterSelect } from '@/features/admin/common/components/filter-select'
import { useListParams } from '@/features/admin/common/utils/use-list-params'
import { UserStatusBadge } from '../components/user-status-badge'
import { fetchAdminUsersQueryOptions, ROLE_VARIANTS, USER_ROLE_OPTIONS } from '../utils/users-queries'

const PAGE_SIZE = 20

const STATUS_OPTIONS: Array<{ value: Exclude<UserStatusFilter, ''>, labelKey: string }> = [
  { value: 'ACTIVE', labelKey: 'admin.users.status.filterActive' },
  { value: 'BLOCKED', labelKey: 'admin.users.status.filterBlocked' },
]

export default function AdminUsersPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const list = useListParams({ defaultSort: 'createdAt', filters: ['role', 'statut'] })
  const role = list.values.role
  const statusOption = STATUS_OPTIONS.find(option => option.value === list.values.statut)
  const status: UserStatusFilter = statusOption?.value ?? ''

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    ...fetchAdminUsersQueryOptions({
      q: list.q || undefined,
      role: role || undefined,
      status,
      sortBy: list.sortBy,
      sortDir: list.sortDir,
      page: list.page,
    }),
    placeholderData: keepPreviousData,
  })

  const columns = useMemo<Array<ColumnDef<AdminUserItem, unknown>>>(() => [
    {
      id: 'name',
      header: t('admin.users.columns.name'),
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      id: 'email',
      header: t('admin.users.columns.email'),
      meta: { wrap: true },
      // The phone rides under the email: both are "how to reach them".
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="flex flex-wrap items-center gap-2">
            <span className={row.original.emailVerified ? '' : 'text-muted-foreground'}>
              {row.original.email ?? '-'}
            </span>
            {row.original.email && !row.original.emailVerified && (
              <Badge variant="outline">{t('admin.users.unverified')}</Badge>
            )}
          </span>
          {row.original.phone && <span className="text-muted-foreground text-xs">{row.original.phone}</span>}
        </span>
      ),
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
      meta: { hideBelow: 'xl' },
      // Raccourci vers la fiche fournisseur quand le compte en a une.
      cell: ({ row }) => (row.original.supplierId
        ? (
            <Link
              className="text-primary underline-offset-4 hover:underline"
              to={`/admin/fournisseurs/${row.original.supplierId}`}
            >
              {row.original.supplierShopName}
            </Link>
          )
        : '-'),
    },
    {
      id: 'createdAt',
      header: t('admin.users.columns.since'),
      meta: { hideBelow: 'lg' },
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(i18n.language),
    },
  ], [t, i18n.language])

  const activeFilters: ActiveFilter[] = []
  if (role) {
    activeFilters.push({
      key: 'role',
      group: t('admin.users.columns.role'),
      value: t(`admin.users.role.${role}`),
      onRemove: () => list.setFilter('role', ''),
    })
  }
  if (statusOption) {
    activeFilters.push({
      key: 'statut',
      group: t('admin.users.columns.status'),
      value: t(statusOption.labelKey),
      onRemove: () => list.setFilter('statut', ''),
    })
  }

  return (
    <AdminListShell
      title={t('admin.users.title')}
      description={t('admin.users.description')}
      searchValue={list.q}
      onSearchChange={list.setSearch}
      searchPlaceholder={t('admin.users.searchPlaceholder')}
      filters={(
        <>
          <FilterSelect
            value={role}
            onValueChange={value => list.setFilter('role', value)}
            allLabel={t('admin.users.allRoles')}
            ariaLabel={t('admin.users.columns.role')}
            options={USER_ROLE_OPTIONS.map(value => ({ value, label: t(`admin.users.role.${value}`) }))}
          />
          <FilterSelect
            value={status}
            onValueChange={value => list.setFilter('statut', value)}
            allLabel={t('admin.users.status.filterAll')}
            ariaLabel={t('admin.users.columns.status')}
            options={STATUS_OPTIONS.map(option => ({ value: option.value, label: t(option.labelKey) }))}
          />
        </>
      )}
      activeFilters={activeFilters}
      onResetFilters={list.reset}
      columns={columns}
      data={data?.items ?? []}
      total={data?.total ?? 0}
      page={list.page}
      pageSize={PAGE_SIZE}
      onPageChange={list.setPage}
      sorting={list.sorting}
      onSortingChange={list.setSorting}
      onRowClick={user => navigate(`/admin/utilisateurs/${user.id}`)}
      isLoading={isLoading}
      isFetching={isFetching}
      isError={isError}
      onRetry={() => refetch()}
      emptyLabel={t('admin.users.empty')}
    />
  )
}
