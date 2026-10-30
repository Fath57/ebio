import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { SupplierValidationItem } from '../utils/validation-queries'
import type { StatusTone } from '@/features/admin/common/components/status-badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { StatusBadge } from '@/features/admin/common/components/status-badge'
import { useListParams } from '@/features/admin/common/utils/use-list-params'
import { fetchPendingSuppliersQueryOptions, VALIDATIONS_PAGE_SIZE } from '../utils/validation-queries'

const STATUS_TONES: Record<string, StatusTone> = {
  PENDING: 'action',
  COMPLEMENT_REQUESTED: 'progress',
  VALIDATED: 'done',
  REJECTED: 'idle',
}

export default function ValidationPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const list = useListParams({ defaultSort: 'submittedAt' })

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    ...fetchPendingSuppliersQueryOptions(list.page),
    placeholderData: keepPreviousData,
  })
  const total = data?.total ?? 0

  const columns = useMemo<Array<ColumnDef<SupplierValidationItem, unknown>>>(() => [
    {
      id: 'supplier',
      header: t('admin.validation.columns.supplier'),
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="font-medium">{row.original.fullName}</span>
          {row.original.email && <span className="text-muted-foreground text-xs">{row.original.email}</span>}
        </span>
      ),
    },
    {
      id: 'shopName',
      header: t('admin.validation.columns.shopName'),
      cell: ({ row }) => row.original.shopName,
    },
    {
      id: 'phone',
      header: t('admin.validation.columns.phone'),
      cell: ({ row }) => row.original.phone ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'submittedAt',
      header: t('admin.validation.columns.submittedAt'),
      cell: ({ row }) => new Date(row.original.submittedAt).toLocaleDateString(i18n.language),
    },
    {
      id: 'status',
      header: t('admin.validation.columns.status'),
      cell: ({ row }) => (
        <StatusBadge tone={STATUS_TONES[row.original.validationStatus] ?? 'idle'}>
          {t(`admin.suppliers.status.${row.original.validationStatus}`)}
        </StatusBadge>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <Button size="sm" asChild>
          <Link to={`/admin/validations/${row.original.id}`}>{t('admin.validation.review')}</Link>
        </Button>
      ),
    },
  ], [t, i18n.language])

  return (
    <AdminListShell
      title={t('admin.validation.title')}
      description={t('admin.validation.description')}
      actions={total > 0 && (
        <StatusBadge tone="action">{t('admin.validation.pendingCount', { count: total })}</StatusBadge>
      )}
      columns={columns}
      data={data?.items ?? []}
      total={total}
      page={list.page}
      pageSize={VALIDATIONS_PAGE_SIZE}
      onPageChange={list.setPage}
      onRowClick={supplier => navigate(`/admin/validations/${supplier.id}`)}
      isLoading={isLoading}
      isFetching={isFetching}
      isError={isError}
      onRetry={() => refetch()}
      emptyLabel={t('admin.validation.empty')}
    />
  )
}
