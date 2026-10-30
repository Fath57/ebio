import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { AdminOrderListItem } from '../utils/orders-queries'
import type { ActiveFilter } from '@/features/admin/common/components/admin-list-shell'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { FilterSelect } from '@/features/admin/common/components/filter-select'
import { StatusBadge } from '@/features/admin/common/components/status-badge'
import { useListParams } from '@/features/admin/common/utils/use-list-params'
import { ORDER_STATUS_OPTIONS, ORDER_STATUS_TONES, PAYMENT_METHODS } from '../utils/order-status'
import { fetchAdminOrdersQueryOptions } from '../utils/orders-queries'

const PAGE_SIZE = 20

function formatAmount(value: number): string {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

export default function AdminOrdersPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const list = useListParams({ defaultSort: 'createdAt', filters: ['statut'] })
  const status = list.values.statut

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    ...fetchAdminOrdersQueryOptions({
      q: list.q || undefined,
      status: status || undefined,
      sortBy: list.sortBy,
      sortDir: list.sortDir,
      page: list.page,
    }),
    placeholderData: keepPreviousData,
  })

  const columns = useMemo<Array<ColumnDef<AdminOrderListItem, unknown>>>(() => [
    {
      id: 'orderNumber',
      header: t('admin.orders.columns.number'),
      cell: ({ row }) => <span className="font-mono font-medium">{row.original.orderNumber}</span>,
    },
    {
      id: 'createdAt',
      header: t('admin.orders.columns.date'),
      cell: ({ row }) => {
        const date = new Date(row.original.createdAt)
        return (
          <span className="flex flex-col">
            <span>{date.toLocaleDateString(i18n.language)}</span>
            <span className="text-muted-foreground text-xs">
              {date.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
            </span>
          </span>
        )
      },
    },
    {
      id: 'buyer',
      header: t('admin.orders.columns.buyer'),
      cell: ({ row }) => row.original.buyer.name,
    },
    {
      id: 'supplier',
      header: t('admin.orders.columns.supplier'),
      cell: ({ row }) => row.original.supplier.shopName,
    },
    {
      id: 'status',
      header: t('admin.orders.columns.status'),
      cell: ({ row }) => (
        <StatusBadge tone={ORDER_STATUS_TONES[row.original.status] ?? 'idle'}>
          {t(`admin.orders.status.${row.original.status}`)}
        </StatusBadge>
      ),
    },
    {
      id: 'paymentMethod',
      header: t('admin.orders.columns.payment'),
      cell: ({ row }) => {
        const method = row.original.paymentMethod
        if (!method)
          return <span className="text-muted-foreground">—</span>
        return (
          <Badge variant="outline">
            {PAYMENT_METHODS.includes(method) ? t(`admin.orders.paymentMethods.${method}`) : method}
          </Badge>
        )
      },
    },
    {
      id: 'totalAmount',
      header: t('admin.orders.columns.amount'),
      meta: { numeric: true },
      cell: ({ row }) => <span className="font-medium">{formatAmount(row.original.totalAmount)}</span>,
    },
    {
      id: 'commissionAmount',
      header: t('admin.orders.columns.commission'),
      meta: { numeric: true },
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatAmount(row.original.commissionAmount)}</span>
      ),
    },
  ], [t, i18n.language])

  const activeFilters: ActiveFilter[] = status
    ? [{
        key: 'statut',
        group: t('admin.orders.columns.status'),
        value: t(`admin.orders.status.${status}`),
        onRemove: () => list.setFilter('statut', ''),
      }]
    : []

  return (
    <AdminListShell
      title={t('admin.orders.title')}
      description={t('admin.orders.description')}
      searchValue={list.q}
      onSearchChange={list.setSearch}
      searchPlaceholder={t('admin.orders.searchPlaceholder')}
      filters={(
        <FilterSelect
          value={status}
          onValueChange={value => list.setFilter('statut', value)}
          allLabel={t('admin.orders.allStatuses')}
          ariaLabel={t('admin.orders.columns.status')}
          options={ORDER_STATUS_OPTIONS.map(value => ({ value, label: t(`admin.orders.status.${value}`) }))}
        />
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
      onRowClick={order => navigate(`/admin/commandes/${order.id}`)}
      isLoading={isLoading}
      isFetching={isFetching}
      isError={isError}
      onRetry={() => refetch()}
      emptyLabel={t('admin.orders.empty')}
    />
  )
}
