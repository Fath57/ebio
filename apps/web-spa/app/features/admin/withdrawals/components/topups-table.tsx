import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { AdminTopup } from '../utils/withdrawals-queries'
import type { StatusTone } from '@/features/admin/common/components/status-badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { DataTable } from '@boilerstone/ui/components/primitives/data-table'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { StatusBadge } from '@/features/admin/common/components/status-badge'
import { useDataTableLabels } from '@/features/admin/common/utils/use-data-table-labels'
import { formatAmount } from '../utils/format-amount'
import { fetchAdminTopupsQueryOptions } from '../utils/withdrawals-queries'

export const TOPUP_STATUSES = ['PENDING', 'COMPLETED', 'FAILED']

const TOPUP_TONES: Record<string, StatusTone> = {
  PENDING: 'progress',
  COMPLETED: 'done',
  FAILED: 'problem',
}

interface TopupsTableProps {
  status?: string
  q?: string
  /** On a wallet's own page: its topups only, and no link back to it. */
  walletId?: string
  page: number
  onPageChange: (page: number) => void
}

/** Topups, newest first: who paid, how much, and whether the provider confirmed it. */
export function TopupsTable({ status, q, walletId, page, onPageChange }: TopupsTableProps) {
  const { t, i18n } = useTranslation()
  const labels = useDataTableLabels(t(q || status ? 'admin.withdrawals.topupsEmptyFiltered' : 'admin.withdrawals.topupsEmpty'))
  const query = useQuery({
    ...fetchAdminTopupsQueryOptions({ status, q, walletId, page }),
    placeholderData: keepPreviousData,
  })

  const columns = useMemo<Array<ColumnDef<AdminTopup, unknown>>>(() => [
    {
      id: 'createdAt',
      header: t('admin.withdrawals.columns.date'),
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(i18n.language),
    },
    {
      id: 'user',
      header: t('admin.withdrawals.columns.user'),
      cell: ({ row }) => (
        <span className="flex flex-col">
          <Link to={`/admin/utilisateurs/${row.original.userId}`} className="font-medium hover:underline">
            {row.original.userName || '—'}
          </Link>
          {row.original.userEmail && <span className="text-muted-foreground text-xs">{row.original.userEmail}</span>}
        </span>
      ),
    },
    {
      id: 'reference',
      header: t('admin.withdrawals.columns.reference'),
      meta: { hideBelow: 'md' },
      cell: ({ row }) => <span className="text-muted-foreground font-mono text-xs">{row.original.fedapayTransactionId ?? '—'}</span>,
    },
    {
      id: 'amount',
      header: t('admin.withdrawals.columns.amount'),
      meta: { numeric: true },
      cell: ({ row }) => <span className="font-medium">{formatAmount(row.original.amount)}</span>,
    },
    {
      id: 'status',
      header: t('admin.withdrawals.columns.status'),
      cell: ({ row }) => (
        <StatusBadge tone={TOPUP_TONES[row.original.status] ?? 'idle'}>
          {t(`admin.withdrawals.topupStatus.${row.original.status}`)}
        </StatusBadge>
      ),
    },
    ...(walletId
      ? []
      : [{
        id: 'wallet',
        header: '',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <Button asChild variant="ghost" size="sm">
            <Link to={`/admin/reversements/portefeuilles/${row.original.walletId}`}>
              <History className="mr-1 h-4 w-4" />
              {t('admin.withdrawals.history')}
            </Link>
          </Button>
        ),
      } satisfies ColumnDef<AdminTopup, unknown>]),
  ], [t, i18n.language, walletId])

  return (
    <DataTable
      columns={columns}
      data={query.data?.items ?? []}
      total={query.data?.total ?? 0}
      page={page}
      pageSize={query.data?.limit ?? 20}
      onPageChange={onPageChange}
      isLoading={query.isLoading}
      isFetching={query.isFetching}
      isError={query.isError}
      onRetry={() => query.refetch()}
      labels={labels}
    />
  )
}
