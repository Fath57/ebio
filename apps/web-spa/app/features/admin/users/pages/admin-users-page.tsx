import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { AdminUserItem } from '../utils/users-queries'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { useServerSorting } from '@/features/admin/common/utils/use-server-sorting'
import { fetchAdminUsersQueryOptions } from '../utils/users-queries'

const PAGE_SIZE = 20

const ROLE_OPTIONS = ['ADMIN', 'SUPPLIER', 'BUYER']

const ROLE_VARIANTS: Record<string, 'default' | 'secondary' | 'outline'> = {
  ADMIN: 'default',
  SUPPLIER: 'secondary',
  BUYER: 'outline',
}

export default function AdminUsersPage() {
  const { t, i18n } = useTranslation()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [page, setPage] = useState(1)
  const resetPage = useCallback(() => setPage(1), [])
  const { sorting, setSorting, sortBy, sortDir } = useServerSorting('createdAt', resetPage)

  const { data, isLoading } = useQuery(
    fetchAdminUsersQueryOptions({
      q: search || undefined,
      role: role || undefined,
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
        <Badge variant={ROLE_VARIANTS[row.original.role] ?? 'outline'}>
          {t(`admin.users.role.${row.original.role}`)}
        </Badge>
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
        <select
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          value={role}
          onChange={(event) => {
            setRole(event.target.value)
            setPage(1)
          }}
        >
          <option value="">{t('admin.users.allRoles')}</option>
          {ROLE_OPTIONS.map(value => (
            <option key={value} value={value}>
              {t(`admin.users.role.${value}`)}
            </option>
          ))}
        </select>
      )}
      columns={columns}
      data={data?.items ?? []}
      total={data?.total ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      onPageChange={setPage}
      sorting={sorting}
      onSortingChange={setSorting}
      isLoading={isLoading}
      emptyLabel={t('admin.users.empty')}
    />
  )
}
