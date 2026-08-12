import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { AdminSupplierListItem } from '../utils/suppliers-queries'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { useServerSorting } from '@/features/admin/common/utils/use-server-sorting'
import { fetchAdminSuppliersQueryOptions } from '../utils/suppliers-queries'

const PAGE_SIZE = 20

const STATUS_OPTIONS = ['PENDING', 'VALIDATED', 'REJECTED']

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'secondary',
  VALIDATED: 'default',
  REJECTED: 'destructive',
}

export default function AdminSuppliersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const resetPage = useCallback(() => setPage(1), [])
  const { sorting, setSorting, sortBy, sortDir } = useServerSorting('createdAt', resetPage)

  const { data, isLoading } = useQuery(
    fetchAdminSuppliersQueryOptions({
      q: search || undefined,
      status: status || undefined,
      sortBy,
      sortDir,
      page,
    }),
  )

  const columns = useMemo<Array<ColumnDef<AdminSupplierListItem, unknown>>>(() => [
    {
      id: 'shopName',
      header: t('admin.suppliers.columns.shop'),
      cell: ({ row }) => (
        <>
          <div className="font-medium">{row.original.shopName}</div>
          <div className="text-muted-foreground text-xs">
            {row.original.neighborhood ?? row.original.address ?? '—'}
          </div>
        </>
      ),
    },
    {
      id: 'owner',
      header: t('admin.suppliers.columns.owner'),
      enableSorting: false,
      cell: ({ row }) => (
        <>
          <div>{row.original.owner.name}</div>
          <div className="text-muted-foreground text-xs">{row.original.owner.email ?? '—'}</div>
        </>
      ),
    },
    {
      id: 'validationStatus',
      header: t('admin.suppliers.columns.status'),
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANTS[row.original.validationStatus] ?? 'secondary'}>
          {t(`admin.suppliers.status.${row.original.validationStatus}`)}
        </Badge>
      ),
    },
    {
      id: 'productCount',
      header: t('admin.suppliers.columns.products'),
      meta: { align: 'right' },
      cell: ({ row }) => row.original.productCount,
    },
    {
      id: 'orderCount',
      header: t('admin.suppliers.columns.orders'),
      meta: { align: 'right' },
      cell: ({ row }) => row.original.orderCount,
    },
    {
      id: 'rating',
      header: t('admin.suppliers.columns.rating'),
      meta: { align: 'right' },
      cell: ({ row }) => (row.original.rating !== null ? row.original.rating.toFixed(1) : '—'),
    },
    {
      id: 'located',
      header: t('admin.suppliers.columns.located'),
      enableSorting: false,
      // Un fournisseur sans coordonnées n'apparaît sur aucune carte.
      cell: ({ row }) => (row.original.latitude !== null
        ? <Badge variant="outline">{row.original.timezone}</Badge>
        : <Badge variant="destructive">{t('admin.suppliers.notLocated')}</Badge>),
    },
  ], [t])

  return (
    <AdminListShell
      title={t('admin.suppliers.title')}
      description={t('admin.suppliers.description')}
      searchValue={search}
      onSearchChange={(value) => {
        setSearch(value)
        setPage(1)
      }}
      searchPlaceholder={t('admin.suppliers.searchPlaceholder')}
      filters={(
        <select
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)
            setPage(1)
          }}
        >
          <option value="">{t('admin.suppliers.allStatuses')}</option>
          {STATUS_OPTIONS.map(value => (
            <option key={value} value={value}>
              {t(`admin.suppliers.status.${value}`)}
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
      onRowClick={supplier => navigate(`/admin/fournisseurs/${supplier.id}`)}
      isLoading={isLoading}
      emptyLabel={t('admin.suppliers.empty')}
    />
  )
}
