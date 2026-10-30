import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { AdminDelivery } from '../utils/deliveries-queries'
import type { ActiveFilter } from '@/features/admin/common/components/admin-list-shell'
import type { StatusTone } from '@/features/admin/common/components/status-badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { FilterSelect } from '@/features/admin/common/components/filter-select'
import { StatusBadge } from '@/features/admin/common/components/status-badge'
import { useListParams } from '@/features/admin/common/utils/use-list-params'
import {
  ASSIGNABLE_STATUSES,
  DELIVERIES_PAGE_SIZE,
  DELIVERY_STATUSES,
  fetchAdminDeliveriesQueryOptions,
  formatClock,
  formatRelative,
  getPlannedSearchAt,
} from '../utils/deliveries-queries'

/** A run with no courier is the dispatcher's job; a failed one, a problem to look into. */
const STATUS_TONES: Record<string, StatusTone> = {
  AWAITING_COURIER: 'action',
  ACCEPTED: 'progress',
  PICKED_UP: 'progress',
  IN_TRANSIT: 'progress',
  DELIVERED: 'done',
  FAILED: 'problem',
  CANCELLED: 'idle',
}

export default function AdminDeliveriesPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const list = useListParams({ defaultSort: 'updatedAt', filters: ['statut'], defaults: { statut: 'AWAITING_COURIER' } })
  const status = list.values.statut

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    ...fetchAdminDeliveriesQueryOptions({ status: status || undefined, page: list.page }),
    placeholderData: keepPreviousData,
  })

  const columns = useMemo<Array<ColumnDef<AdminDelivery, unknown>>>(() => [
    {
      id: 'order',
      header: t('admin.deliveries.columns.order'),
      cell: ({ row }) => <span className="font-mono font-medium">{row.original.orderNumber}</span>,
    },
    {
      id: 'shop',
      header: t('admin.deliveries.columns.shop'),
      cell: ({ row }) => row.original.supplierShopName,
    },
    {
      id: 'dropoff',
      header: t('admin.deliveries.columns.dropoff'),
      meta: { className: 'max-w-xs truncate' },
      cell: ({ row }) => row.original.dropoffAddress,
    },
    {
      id: 'courier',
      header: t('admin.deliveries.columns.courier'),
      cell: ({ row }) => row.original.courier?.name ?? (
        <span className="text-muted-foreground">{t('admin.deliveries.noCourier')}</span>
      ),
    },
    {
      id: 'status',
      header: t('admin.deliveries.columns.status'),
      cell: ({ row }) => {
        const plannedSearchAt = getPlannedSearchAt(row.original)
        return (
          <span className="flex items-center gap-2">
            <StatusBadge tone={STATUS_TONES[row.original.status] ?? 'idle'}>
              {t(`admin.deliveries.statuses.${row.original.status}`)}
            </StatusBadge>
            {plannedSearchAt && (
              <span className="text-muted-foreground text-xs">
                {t('admin.deliveries.plannedShort', { time: formatClock(plannedSearchAt, i18n.language) })}
              </span>
            )}
          </span>
        )
      },
    },
    {
      id: 'updatedAt',
      header: t('admin.deliveries.columns.updatedAt'),
      cell: ({ row }) => {
        const lastEvent = row.original.events[row.original.events.length - 1]
        return (
          <span className="text-muted-foreground">
            {formatRelative(lastEvent?.occurredAt ?? row.original.createdAt, i18n.language)}
          </span>
        )
      },
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => ASSIGNABLE_STATUSES.includes(row.original.status) && (
        <Button size="sm" variant={row.original.courier ? 'outline' : 'default'} asChild>
          <Link to={`/admin/livraisons/${row.original.id}/assigner`}>
            {t(row.original.courier ? 'admin.deliveries.changeCourier' : 'admin.deliveries.assign')}
          </Link>
        </Button>
      ),
    },
  ], [t, i18n.language])

  const activeFilters: ActiveFilter[] = status
    ? [{
        key: 'statut',
        group: t('admin.deliveries.columns.status'),
        value: t(`admin.deliveries.statuses.${status}`),
        onRemove: () => list.setFilter('statut', ''),
      }]
    : []

  return (
    <AdminListShell
      title={t('admin.deliveries.title')}
      description={t('admin.deliveries.description')}
      filters={(
        <FilterSelect
          value={status}
          onValueChange={value => list.setFilter('statut', value)}
          allLabel={t('admin.deliveries.statuses.all')}
          ariaLabel={t('admin.deliveries.filterByStatus')}
          options={DELIVERY_STATUSES.map(value => ({ value, label: t(`admin.deliveries.statuses.${value}`) }))}
        />
      )}
      activeFilters={activeFilters}
      onResetFilters={list.reset}
      columns={columns}
      data={data?.deliveries ?? []}
      total={data?.total ?? 0}
      page={list.page}
      pageSize={DELIVERIES_PAGE_SIZE}
      onPageChange={list.setPage}
      onRowClick={delivery => navigate(`/admin/commandes/${delivery.orderId}`)}
      isLoading={isLoading}
      isFetching={isFetching}
      isError={isError}
      onRetry={() => refetch()}
      emptyLabel={t('admin.deliveries.empty')}
    />
  )
}
