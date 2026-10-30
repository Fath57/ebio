import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { AdminCourierItem } from '../utils/couriers-queries'
import type { StatusTone } from '@/features/admin/common/components/status-badge'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { StatusBadge } from '@/features/admin/common/components/status-badge'
import { useListParams } from '@/features/admin/common/utils/use-list-params'
import { CourierRating } from '../components/courier-rating'
import { fetchAdminCouriersQueryOptions } from '../utils/couriers-queries'

const PAGE_SIZE = 20

const STATUS_OPTIONS = ['PENDING', 'VALIDATED', 'REJECTED', 'SUSPENDED']

const STATUS_TONES: Record<string, StatusTone> = {
  PENDING: 'action',
  COMPLEMENT_REQUESTED: 'progress',
  VALIDATED: 'done',
  REJECTED: 'idle',
  SUSPENDED: 'problem',
}

export default function AdminCouriersPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  // Applications waiting for review come first: that is what the staff opens this page for.
  const list = useListParams({ defaultSort: 'createdAt', filters: ['statut'], defaults: { statut: 'PENDING' } })
  const status = list.values.statut

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    ...fetchAdminCouriersQueryOptions({ status: status || undefined, page: list.page }),
    placeholderData: keepPreviousData,
  })

  const columns = useMemo<Array<ColumnDef<AdminCourierItem, unknown>>>(() => [
    {
      id: 'name',
      header: t('admin.couriers.columns.name'),
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="font-medium">{row.original.fullName}</span>
          <span className="text-muted-foreground text-xs">{row.original.phone}</span>
        </span>
      ),
    },
    {
      id: 'vehicle',
      header: t('admin.couriers.columns.vehicle'),
      cell: ({ row }) => t(`admin.couriers.vehicles.${row.original.vehicleType.toLowerCase()}`),
    },
    {
      id: 'zone',
      header: t('admin.couriers.columns.zone'),
      meta: { className: 'max-w-xs truncate' },
      cell: ({ row }) => row.original.zone,
    },
    {
      id: 'status',
      header: t('admin.couriers.columns.status'),
      cell: ({ row }) => (
        <StatusBadge tone={STATUS_TONES[row.original.validationStatus] ?? 'idle'}>
          {t(`admin.couriers.statuses.${row.original.validationStatus.toLowerCase()}`)}
        </StatusBadge>
      ),
    },
    {
      id: 'rating',
      header: t('admin.couriers.columns.rating'),
      cell: ({ row }) => <CourierRating ratingAvg={row.original.ratingAvg} ratingCount={row.original.ratingCount} />,
    },
    {
      id: 'createdAt',
      header: t('admin.couriers.columns.submittedAt'),
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(i18n.language),
    },
  ], [t, i18n.language])

  return (
    <AdminListShell
      title={t('admin.couriers.title')}
      description={t('admin.couriers.description')}
      statusTabs={{
        tabs: STATUS_OPTIONS.map(value => ({
          value,
          label: t(`admin.couriers.statuses.${value.toLowerCase()}`),
          tone: STATUS_TONES[value],
        })),
        value: status,
        onChange: value => list.setFilter('statut', value),
        counts: data?.statusCounts,
      }}
      onResetFilters={list.reset}
      columns={columns}
      data={data?.couriers ?? []}
      total={data?.total ?? 0}
      page={list.page}
      pageSize={PAGE_SIZE}
      onPageChange={list.setPage}
      onRowClick={courier => navigate(`/admin/livreurs/${courier.id}`)}
      isLoading={isLoading}
      isFetching={isFetching}
      isError={isError}
      onRetry={() => refetch()}
      emptyLabel={t('admin.couriers.empty')}
    />
  )
}
