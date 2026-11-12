import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { AdminTopup, AdminWalletListItem, AdminWalletTransaction } from '../utils/wallets-queries'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent } from '@boilerstone/ui/components/primitives/card'
import { DataTable } from '@boilerstone/ui/components/primitives/data-table'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { MinusCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { BackLink } from '@/features/admin/common/components/back-link'
import { StatusTabs } from '@/features/admin/common/components/status-tabs'
import { useDataTableLabels } from '@/features/admin/common/utils/use-data-table-labels'
import { BeneficiaryCell } from '@/features/admin/withdrawals/components/beneficiary-cell'
import { Can } from '@/lib/casl/can'
import { DebitDialog } from '../components/debit-dialog'
import { useTopupColumns } from '../components/topup-columns'
import { formatAmount, formatSignedAmount } from '../utils/format-amount'
import { fetchAdminTopupsQueryOptions, fetchAdminWalletQueryOptions, fetchAdminWalletTransactionsQueryOptions } from '../utils/wallets-queries'

type Tab = 'mouvements' | 'recharges'

function amountToneClass(value: number): string {
  if (value < 0)
    return 'text-ebio-coral-600'
  if (value > 0)
    return 'text-ebio-green-600'
  return 'text-muted-foreground'
}

/**
 * One wallet's history: its balance, every credit and debit that built it,
 * and the topups paid into it — confirmed, pending or failed.
 */
export default function AdminWalletDetailPage() {
  const { t, i18n } = useTranslation()
  const { walletId = '' } = useParams()
  const [tab, setTab] = useState<Tab>('mouvements')
  const [movementsPage, setMovementsPage] = useState(1)
  const [topupsPage, setTopupsPage] = useState(1)
  const [debitTarget, setDebitTarget] = useState<AdminWalletListItem | null>(null)

  const wallet = useQuery(fetchAdminWalletQueryOptions(walletId))

  return (
    <div className="space-y-6">
      <BackLink fallback="/admin/portefeuilles" />

      {wallet.isError && (
        <p className="text-destructive" role="alert">{t('admin.wallets.detail.notFound')}</p>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
          {wallet.data
            ? (
                <div className="space-y-1">
                  <BeneficiaryCell {...wallet.data} />
                  <p className="text-muted-foreground text-xs">
                    {t('admin.wallets.detail.updatedAt', { date: new Date(wallet.data.updatedAt).toLocaleString(i18n.language) })}
                  </p>
                </div>
              )
            : <Skeleton className="h-10 w-56" />}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-muted-foreground text-sm">{t('admin.wallets.columns.balance')}</p>
              {wallet.data
                ? <p className={`font-mono text-2xl font-bold ${wallet.data.balance < 0 ? 'text-ebio-coral-600' : ''}`}>{formatAmount(wallet.data.balance)}</p>
                : <Skeleton className="h-8 w-32" />}
            </div>
            {wallet.data && wallet.data.balance > 0 && (
              <Can action="manage" subject="Withdrawal">
                <Button variant="outline" size="sm" onClick={() => setDebitTarget(wallet.data)}>
                  <MinusCircle className="mr-1 h-4 w-4" />
                  {t('admin.wallets.debit.action')}
                </Button>
              </Can>
            )}
          </div>
        </CardContent>
      </Card>

      <StatusTabs
        allTab={false}
        tabs={[
          { value: 'mouvements', label: t('admin.wallets.detail.movements') },
          { value: 'recharges', label: t('admin.wallets.detail.topups') },
        ]}
        value={tab}
        onChange={next => setTab(next as Tab)}
      />

      {tab === 'mouvements' && <MovementsTable walletId={walletId} page={movementsPage} onPageChange={setMovementsPage} />}
      {tab === 'recharges' && <WalletTopupsTable walletId={walletId} page={topupsPage} onPageChange={setTopupsPage} />}

      <DebitDialog wallet={debitTarget} onClose={() => setDebitTarget(null)} />
    </div>
  )
}

function MovementsTable({ walletId, page, onPageChange }: { walletId: string, page: number, onPageChange: (page: number) => void }) {
  const { t, i18n } = useTranslation()
  const labels = useDataTableLabels(t('admin.wallets.detail.movementsEmpty'))
  const query = useQuery({
    ...fetchAdminWalletTransactionsQueryOptions(walletId, page),
    placeholderData: keepPreviousData,
  })

  const columns = useMemo<Array<ColumnDef<AdminWalletTransaction, unknown>>>(() => [
    {
      id: 'createdAt',
      header: t('admin.wallets.columns.date'),
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(i18n.language),
    },
    {
      id: 'type',
      header: t('admin.wallets.columns.type'),
      cell: ({ row }) => t(`admin.wallets.movementTypes.${row.original.type}`, { defaultValue: row.original.type }),
    },
    {
      id: 'description',
      header: t('admin.wallets.columns.description'),
      meta: { hideBelow: 'md' },
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.description}</span>,
    },
    {
      id: 'amount',
      header: t('admin.wallets.columns.amount'),
      meta: { numeric: true },
      cell: ({ row }) => (
        <span className={`font-medium ${amountToneClass(row.original.amount)}`}>{formatSignedAmount(row.original.amount)}</span>
      ),
    },
    {
      id: 'balanceAfter',
      header: t('admin.wallets.columns.balanceAfter'),
      meta: { numeric: true },
      cell: ({ row }) => formatAmount(row.original.balanceAfter),
    },
  ], [t, i18n.language])

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

function WalletTopupsTable({ walletId, page, onPageChange }: { walletId: string, page: number, onPageChange: (page: number) => void }) {
  const { t } = useTranslation()
  const labels = useDataTableLabels(t('admin.wallets.detail.topupsEmpty'))
  const columns = useTopupColumns({ withWalletLink: false })
  const query = useQuery({
    ...fetchAdminTopupsQueryOptions({ walletId, page }),
    placeholderData: keepPreviousData,
  })

  return (
    <DataTable<AdminTopup>
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
