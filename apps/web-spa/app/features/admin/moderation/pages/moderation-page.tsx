import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { ReportItem } from '../utils/moderation-queries'
import type { ActiveFilter } from '@/features/admin/common/components/admin-list-shell'
import type { StatusTone } from '@/features/admin/common/components/status-badge'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { ConfirmDialog } from '@/features/admin/common/components/confirm-dialog'
import { FilterSelect } from '@/features/admin/common/components/filter-select'
import { StatusBadge } from '@/features/admin/common/components/status-badge'
import { useListParams } from '@/features/admin/common/utils/use-list-params'
import { Can } from '@/lib/casl/can'
import {
  deleteContentMutationOptions,
  fetchReportsQueryOptions,
  ignoreReportMutationOptions,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
  REPORTS_PAGE_SIZE,
  warnAuthorMutationOptions,
} from '../utils/moderation-queries'

const STATUS_TONES: Record<string, StatusTone> = {
  PENDING: 'action',
  RESOLVED: 'done',
  DISMISSED: 'idle',
}

export default function ModerationPage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const list = useListParams({ defaultSort: 'createdAt', filters: ['type', 'statut'], defaults: { statut: 'PENDING' } })
  const { type, statut: status } = list.values
  const [deleting, setDeleting] = useState<ReportItem | null>(null)

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    ...fetchReportsQueryOptions({ type: type || undefined, status: status || undefined, page: list.page }),
    placeholderData: keepPreviousData,
  })

  const onResolved = () => {
    toast.success(t('admin.moderation.resolved'))
    queryClient.invalidateQueries({ queryKey: ['admin', 'moderation'] })
  }
  const onFailed = (error: Error) => {
    toast.error(error.message || t('common.error'))
  }

  const deleteContent = useMutation({
    ...deleteContentMutationOptions,
    onSuccess: () => {
      setDeleting(null)
      onResolved()
    },
    onError: onFailed,
  })
  const warnAuthor = useMutation({ ...warnAuthorMutationOptions, onSuccess: onResolved, onError: onFailed })
  const ignoreReport = useMutation({ ...ignoreReportMutationOptions, onSuccess: onResolved, onError: onFailed })
  const isPending = deleteContent.isPending || warnAuthor.isPending || ignoreReport.isPending

  const columns = useMemo<Array<ColumnDef<ReportItem, unknown>>>(() => [
    {
      id: 'type',
      header: t('admin.moderation.columns.type'),
      cell: ({ row }) => (
        <Badge variant="outline">{t(`admin.moderation.types.${row.original.targetType.toLowerCase()}`)}</Badge>
      ),
    },
    {
      id: 'reason',
      header: t('admin.moderation.columns.reason'),
      meta: { className: 'max-w-sm truncate' },
      cell: ({ row }) => <span title={row.original.reason}>{row.original.reason}</span>,
    },
    {
      id: 'reportedBy',
      header: t('admin.moderation.columns.reportedBy'),
      cell: ({ row }) => row.original.reporterName,
    },
    {
      id: 'createdAt',
      header: t('admin.moderation.columns.date'),
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(i18n.language),
    },
    {
      id: 'status',
      header: t('admin.moderation.columns.status'),
      cell: ({ row }) => (
        <StatusBadge tone={STATUS_TONES[row.original.status] ?? 'idle'}>
          {t(`admin.moderation.statuses.${row.original.status.toLowerCase()}`)}
        </StatusBadge>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      // A handled report keeps its row for the record, without buttons that would act twice.
      cell: ({ row }) => row.original.status === 'PENDING' && (
        <Can action="manage" subject="ContentReport">
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => ignoreReport.mutate(row.original.id)}>
              {t('admin.moderation.actions.ignore')}
            </Button>
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => warnAuthor.mutate(row.original.id)}>
              {t('admin.moderation.actions.warnAuthor')}
            </Button>
            <Button size="sm" variant="destructive" disabled={isPending} onClick={() => setDeleting(row.original)}>
              {t('admin.moderation.actions.deleteContent')}
            </Button>
          </div>
        </Can>
      ),
    },
  ], [t, i18n.language, isPending, ignoreReport, warnAuthor])

  const activeFilters: ActiveFilter[] = []
  if (type) {
    activeFilters.push({
      key: 'type',
      group: t('admin.moderation.columns.type'),
      value: t(`admin.moderation.types.${type.toLowerCase()}`),
      onRemove: () => list.setFilter('type', ''),
    })
  }
  if (status) {
    activeFilters.push({
      key: 'statut',
      group: t('admin.moderation.columns.status'),
      value: t(`admin.moderation.statuses.${status.toLowerCase()}`),
      onRemove: () => list.setFilter('statut', ''),
    })
  }

  return (
    <>
      <AdminListShell
        title={t('admin.moderation.title')}
        description={t('admin.moderation.description')}
        filters={(
          <>
            <FilterSelect
              value={type}
              onValueChange={value => list.setFilter('type', value)}
              allLabel={t('admin.moderation.types.all')}
              ariaLabel={t('admin.moderation.filterByType')}
              options={REPORT_TARGET_TYPES.map(value => ({ value, label: t(`admin.moderation.types.${value.toLowerCase()}`) }))}
            />
            <FilterSelect
              value={status}
              onValueChange={value => list.setFilter('statut', value)}
              allLabel={t('admin.moderation.statuses.all')}
              ariaLabel={t('admin.moderation.columns.status')}
              options={REPORT_STATUSES.map(value => ({ value, label: t(`admin.moderation.statuses.${value.toLowerCase()}`) }))}
            />
          </>
        )}
        activeFilters={activeFilters}
        onResetFilters={list.reset}
        columns={columns}
        data={data?.items ?? []}
        total={data?.total ?? 0}
        page={list.page}
        pageSize={REPORTS_PAGE_SIZE}
        onPageChange={list.setPage}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        onRetry={() => refetch()}
        emptyLabel={t('admin.moderation.empty')}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open)
            setDeleting(null)
        }}
        title={t('admin.moderation.confirmDelete.title')}
        description={t('admin.moderation.confirmDelete.description')}
        confirmLabel={t('admin.moderation.actions.deleteContent')}
        onConfirm={() => deleting && deleteContent.mutate(deleting.id)}
        isPending={deleteContent.isPending}
        destructive
      />
    </>
  )
}
