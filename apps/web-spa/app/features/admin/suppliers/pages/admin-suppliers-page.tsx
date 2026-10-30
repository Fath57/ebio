import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { AdminSupplierListItem } from '../utils/suppliers-queries'
import type { StatusTone } from '@/features/admin/common/components/status-badge'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { StatusBadge } from '@/features/admin/common/components/status-badge'
import { useListParams } from '@/features/admin/common/utils/use-list-params'
import { fetchAdminSuppliersQueryOptions } from '../utils/suppliers-queries'

const PAGE_SIZE = 20

// Review order: waiting, waiting on the shop, then the outcomes.
const STATUS_OPTIONS = ['PENDING', 'COMPLEMENT_REQUESTED', 'VALIDATED', 'SUSPENDED', 'REJECTED']

/** A shop waiting for review is the staff's move; one waiting for documents is the shop's. */
const STATUS_TONES: Record<string, StatusTone> = {
  PENDING: 'action',
  VALIDATED: 'done',
  COMPLEMENT_REQUESTED: 'progress',
  SUSPENDED: 'problem',
  REJECTED: 'idle',
}

export default function AdminSuppliersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const list = useListParams({ defaultSort: 'createdAt', filters: ['statut'] })
  const status = list.values.statut

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    ...fetchAdminSuppliersQueryOptions({
      q: list.q || undefined,
      status: status || undefined,
      sortBy: list.sortBy,
      sortDir: list.sortDir,
      page: list.page,
    }),
    placeholderData: keepPreviousData,
  })

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
        <StatusBadge tone={STATUS_TONES[row.original.validationStatus] ?? 'idle'}>
          {t(`admin.suppliers.status.${row.original.validationStatus}`)}
        </StatusBadge>
      ),
    },
    {
      id: 'productCount',
      header: t('admin.suppliers.columns.products'),
      meta: { numeric: true },
      cell: ({ row }) => row.original.productCount,
    },
    {
      id: 'orderCount',
      header: t('admin.suppliers.columns.orders'),
      meta: { numeric: true },
      cell: ({ row }) => row.original.orderCount,
    },
    {
      id: 'rating',
      header: t('admin.suppliers.columns.rating'),
      meta: { numeric: true },
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
      searchValue={list.q}
      onSearchChange={list.setSearch}
      searchPlaceholder={t('admin.suppliers.searchPlaceholder')}
      statusTabs={{
        tabs: STATUS_OPTIONS.map(value => ({
          value,
          label: t(`admin.suppliers.status.${value}`),
          tone: STATUS_TONES[value],
        })),
        value: status,
        onChange: value => list.setFilter('statut', value),
        counts: data?.statusCounts,
      }}
      onResetFilters={list.reset}
      columns={columns}
      data={data?.items ?? []}
      total={data?.total ?? 0}
      page={list.page}
      pageSize={PAGE_SIZE}
      onPageChange={list.setPage}
      sorting={list.sorting}
      onSortingChange={list.setSorting}
      onRowClick={supplier => navigate(`/admin/fournisseurs/${supplier.id}`)}
      isLoading={isLoading}
      isFetching={isFetching}
      isError={isError}
      onRetry={() => refetch()}
      emptyLabel={t('admin.suppliers.empty')}
    />
  )
}
