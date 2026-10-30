import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { ReactNode } from 'react'
import type { AdminPayoutNumber, AdminTopup, AdminWalletRow, AdminWithdrawal } from '../utils/withdrawals-queries'
import type { StatusTone } from '@/features/admin/common/components/status-badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { DataTable } from '@boilerstone/ui/components/primitives/data-table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@boilerstone/ui/components/primitives/dialog'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/features/admin/common/components/confirm-dialog'
import { FilterSelect } from '@/features/admin/common/components/filter-select'
import { StatusBadge } from '@/features/admin/common/components/status-badge'
import { useDataTableLabels } from '@/features/admin/common/utils/use-data-table-labels'
import { useReturnFocus } from '@/features/admin/common/utils/use-return-focus'
import { BeneficiaryCell } from '../components/beneficiary-cell'
import {
  actOnPayoutNumber,
  actOnWithdrawal,
  fetchAdminTopupsQueryOptions,
  fetchAdminWithdrawalsQueryOptions,
  fetchPayoutNumbersQueryOptions,
  fetchWalletsOverviewQueryOptions,
} from '../utils/withdrawals-queries'

const PAGE_SIZE = 20

const WITHDRAWAL_STATUSES = ['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REJECTED', 'CANCELLED']

const WITHDRAWAL_TONES: Record<string, StatusTone> = {
  PENDING: 'action',
  PROCESSING: 'progress',
  PAID: 'done',
  FAILED: 'problem',
  REJECTED: 'idle',
  CANCELLED: 'idle',
}

const TOPUP_TONES: Record<string, StatusTone> = {
  PENDING: 'progress',
  COMPLETED: 'done',
  FAILED: 'problem',
}

function formatAmount(value: number): string {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

/** Reject dialog shared by numbers and withdrawals: the reason is mandatory. */
interface RejectTarget {
  kind: 'number' | 'withdrawal'
  id: string
  label: string
}

/**
 * Money first: the requests waiting to be paid, then the numbers waiting to
 * be trusted, then the balances and the topups, which are only there to be read.
 */
export default function AdminWithdrawalsPage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [approveTarget, setApproveTarget] = useState<AdminWithdrawal | null>(null)
  const [approveError, setApproveError] = useState<string | null>(null)
  const [requestsStatus, setRequestsStatus] = useState('PENDING')
  const [requestsPage, setRequestsPage] = useState(1)
  const [numbersPage, setNumbersPage] = useState(1)
  const [topupsPage, setTopupsPage] = useState(1)

  const numbers = useQuery({
    ...fetchPayoutNumbersQueryOptions('PENDING', numbersPage),
    placeholderData: keepPreviousData,
  })
  const withdrawals = useQuery({
    ...fetchAdminWithdrawalsQueryOptions(requestsStatus || undefined, requestsPage),
    placeholderData: keepPreviousData,
  })
  const overview = useQuery(fetchWalletsOverviewQueryOptions())
  const topups = useQuery({
    ...fetchAdminTopupsQueryOptions(undefined, topupsPage),
    placeholderData: keepPreviousData,
  })

  const requestsLabels = useDataTableLabels(t('admin.withdrawals.requestsEmpty'))
  const numbersLabels = useDataTableLabels(t('admin.withdrawals.numbersEmpty'))
  const walletsLabels = useDataTableLabels(t('admin.withdrawals.walletsEmpty'))
  const topupsLabels = useDataTableLabels(t('admin.withdrawals.topupsEmpty'))

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'payout-numbers'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'withdrawals'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'wallets'] })
  }

  const numberAction = useMutation({
    mutationFn: ({ id, action, reason }: { id: string, action: 'validate' | 'reject', reason?: string }) =>
      actOnPayoutNumber(id, action, reason),
    onSuccess: () => {
      setRejectTarget(null)
      setRejectReason('')
      invalidate()
    },
  })

  const withdrawalAction = useMutation({
    mutationFn: ({ id, action, reason }: { id: string, action: 'approve' | 'reject', reason?: string }) =>
      actOnWithdrawal(id, action, reason),
    onSuccess: () => {
      setRejectTarget(null)
      setRejectReason('')
      setApproveTarget(null)
      setApproveError(null)
      invalidate()
    },
    // A failed payout re-credits the supplier automatically; surface why.
    onError: (error: Error) => {
      setApproveError(error.message)
      invalidate()
    },
  })

  const isActing = numberAction.isPending || withdrawalAction.isPending
  const returnFocusAfterReject = useReturnFocus(rejectTarget !== null)

  const submitReject = () => {
    if (!rejectTarget || rejectReason.trim().length < 3)
      return
    if (rejectTarget.kind === 'number')
      numberAction.mutate({ id: rejectTarget.id, action: 'reject', reason: rejectReason.trim() })
    else
      withdrawalAction.mutate({ id: rejectTarget.id, action: 'reject', reason: rejectReason.trim() })
  }

  const requestColumns = useMemo<Array<ColumnDef<AdminWithdrawal, unknown>>>(() => [
    {
      id: 'createdAt',
      header: t('admin.withdrawals.columns.date'),
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(i18n.language),
    },
    {
      id: 'beneficiary',
      header: t('admin.withdrawals.columns.beneficiary'),
      cell: ({ row }) => (
        <BeneficiaryCell
          ownerType={row.original.ownerType}
          ownerName={row.original.ownerName}
          supplierId={row.original.supplierId}
          courierId={row.original.courierId}
        />
      ),
    },
    {
      id: 'number',
      header: t('admin.withdrawals.columns.number'),
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="font-mono">{row.original.phoneNumber}</span>
          <span className="text-muted-foreground text-xs">{row.original.operatorLabel}</span>
        </span>
      ),
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
        <span className="flex flex-col items-start gap-1">
          <StatusBadge tone={WITHDRAWAL_TONES[row.original.status] ?? 'idle'}>
            {t(`admin.withdrawals.status.${row.original.status}`)}
          </StatusBadge>
          {row.original.rejectionReason && (
            <span className="text-muted-foreground text-xs whitespace-normal">{row.original.rejectionReason}</span>
          )}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => row.original.status === 'PENDING' && (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={isActing}
            onClick={() => setRejectTarget({
              kind: 'withdrawal',
              id: row.original.id,
              label: `${formatAmount(row.original.amount)} — ${row.original.ownerName}`,
            })}
          >
            {t('admin.withdrawals.reject')}
          </Button>
          <Button
            size="sm"
            disabled={isActing}
            onClick={() => {
              setApproveError(null)
              setApproveTarget(row.original)
            }}
          >
            {t('admin.withdrawals.approve')}
          </Button>
        </div>
      ),
    },
  ], [t, i18n.language, isActing])

  const numberColumns = useMemo<Array<ColumnDef<AdminPayoutNumber, unknown>>>(() => [
    {
      id: 'beneficiary',
      header: t('admin.withdrawals.columns.beneficiary'),
      cell: ({ row }) => (
        <BeneficiaryCell
          ownerType={row.original.ownerType}
          ownerName={row.original.ownerName}
          supplierId={row.original.supplierId}
          courierId={row.original.courierId}
        />
      ),
    },
    {
      id: 'number',
      header: t('admin.withdrawals.columns.number'),
      cell: ({ row }) => <span className="font-mono">{row.original.phoneNumber}</span>,
    },
    {
      id: 'operator',
      header: t('admin.withdrawals.columns.operator'),
      cell: ({ row }) => row.original.operatorLabel,
    },
    {
      id: 'holder',
      header: t('admin.withdrawals.columns.holder'),
      cell: ({ row }) => row.original.holderName,
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={isActing}
            onClick={() => setRejectTarget({ kind: 'number', id: row.original.id, label: row.original.phoneNumber })}
          >
            <XCircle className="text-destructive mr-1 h-4 w-4" />
            {t('admin.withdrawals.reject')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isActing}
            onClick={() => numberAction.mutate({ id: row.original.id, action: 'validate' })}
          >
            <CheckCircle2 className="text-ebio-green-600 mr-1 h-4 w-4" />
            {t('admin.withdrawals.validate')}
          </Button>
        </div>
      ),
    },
  ], [t, isActing, numberAction])

  const walletColumns = useMemo<Array<ColumnDef<AdminWalletRow, unknown>>>(() => [
    {
      id: 'beneficiary',
      header: t('admin.withdrawals.columns.beneficiary'),
      cell: ({ row }) => (
        <BeneficiaryCell
          ownerType={row.original.ownerType}
          ownerName={row.original.ownerName}
          supplierId={row.original.supplierId}
          courierId={row.original.courierId}
        />
      ),
    },
    {
      id: 'balance',
      header: t('admin.withdrawals.columns.balance'),
      meta: { numeric: true },
      cell: ({ row }) => (
        <span className={row.original.balance < 0 ? 'text-destructive font-medium' : 'font-medium'}>
          {formatAmount(row.original.balance)}
        </span>
      ),
    },
    {
      id: 'updatedAt',
      header: t('admin.withdrawals.columns.updatedAt'),
      cell: ({ row }) => (
        <span className="text-muted-foreground">{new Date(row.original.updatedAt).toLocaleDateString(i18n.language)}</span>
      ),
    },
  ], [t, i18n.language])

  const topupColumns = useMemo<Array<ColumnDef<AdminTopup, unknown>>>(() => [
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
          <span className="font-medium">{row.original.userName}</span>
          {row.original.userEmail && <span className="text-muted-foreground text-xs">{row.original.userEmail}</span>}
        </span>
      ),
    },
    {
      id: 'reference',
      header: t('admin.withdrawals.columns.reference'),
      cell: ({ row }) => (
        <span className="text-muted-foreground font-mono text-xs">{row.original.fedapayTransactionId ?? '—'}</span>
      ),
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
  ], [t, i18n.language])

  const wallets = overview.data?.wallets ?? []

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold">{t('admin.withdrawals.title')}</h2>
        <p className="text-muted-foreground">{t('admin.withdrawals.description')}</p>
      </div>

      {approveError && !approveTarget && (
        <p className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border p-3 text-sm" role="alert">
          {approveError}
        </p>
      )}

      <Section
        title={t('admin.withdrawals.requestsTitle')}
        hint={t('admin.withdrawals.requestsHint')}
        action={(
          <FilterSelect
            value={requestsStatus}
            onValueChange={(value) => {
              setRequestsStatus(value)
              setRequestsPage(1)
            }}
            allLabel={t('admin.withdrawals.allStatuses')}
            ariaLabel={t('admin.withdrawals.columns.status')}
            options={WITHDRAWAL_STATUSES.map(value => ({ value, label: t(`admin.withdrawals.status.${value}`) }))}
          />
        )}
      >
        <DataTable
          columns={requestColumns}
          data={withdrawals.data?.items ?? []}
          total={withdrawals.data?.total ?? 0}
          page={requestsPage}
          pageSize={withdrawals.data?.limit ?? PAGE_SIZE}
          onPageChange={setRequestsPage}
          isLoading={withdrawals.isLoading}
          isFetching={withdrawals.isFetching}
          isError={withdrawals.isError}
          onRetry={() => withdrawals.refetch()}
          labels={requestsLabels}
        />
      </Section>

      <Section title={t('admin.withdrawals.numbersTitle')} hint={t('admin.withdrawals.numbersHint')}>
        <DataTable
          columns={numberColumns}
          data={numbers.data?.items ?? []}
          total={numbers.data?.total ?? 0}
          page={numbersPage}
          pageSize={numbers.data?.limit ?? PAGE_SIZE}
          onPageChange={setNumbersPage}
          isLoading={numbers.isLoading}
          isFetching={numbers.isFetching}
          isError={numbers.isError}
          onRetry={() => numbers.refetch()}
          labels={numbersLabels}
        />
      </Section>

      <div className="grid gap-4 sm:grid-cols-2">
        <BalanceCard
          label={t('admin.withdrawals.totalOwed')}
          hint={t('admin.withdrawals.totalOwedHint')}
          value={formatAmount(overview.data?.totalOwed ?? 0)}
          isLoading={overview.isLoading}
          highlight
        />
        <BalanceCard
          label={t('admin.withdrawals.totalDebt')}
          hint={t('admin.withdrawals.totalDebtHint')}
          value={formatAmount(overview.data?.totalDebt ?? 0)}
          isLoading={overview.isLoading}
        />
      </div>

      <Section title={t('admin.withdrawals.walletsTitle')} hint={t('admin.withdrawals.walletsHint')}>
        <DataTable
          columns={walletColumns}
          data={wallets}
          total={wallets.length}
          page={1}
          pageSize={Math.max(wallets.length, 1)}
          onPageChange={() => {}}
          isLoading={overview.isLoading}
          isError={overview.isError}
          onRetry={() => overview.refetch()}
          labels={walletsLabels}
        />
      </Section>

      <Section title={t('admin.withdrawals.topupsTitle')} hint={t('admin.withdrawals.topupsHint')}>
        <DataTable
          columns={topupColumns}
          data={topups.data?.items ?? []}
          total={topups.data?.total ?? 0}
          page={topupsPage}
          pageSize={topups.data?.limit ?? PAGE_SIZE}
          onPageChange={setTopupsPage}
          isLoading={topups.isLoading}
          isFetching={topups.isFetching}
          isError={topups.isError}
          onRetry={() => topups.refetch()}
          labels={topupsLabels}
        />
      </Section>

      {/* Paying sends money out at once: it never happens on a single click. */}
      <ConfirmDialog
        open={approveTarget !== null}
        onOpenChange={(open) => {
          if (!open)
            setApproveTarget(null)
        }}
        title={t('admin.withdrawals.approveTitle')}
        description={t('admin.withdrawals.approveBody', {
          amount: approveTarget ? formatAmount(approveTarget.amount) : '',
          name: approveTarget?.ownerName ?? '',
          number: approveTarget ? `${approveTarget.phoneNumber} (${approveTarget.operatorLabel})` : '',
        })}
        confirmLabel={t('admin.withdrawals.approve')}
        onConfirm={() => approveTarget && withdrawalAction.mutate({ id: approveTarget.id, action: 'approve' })}
        isPending={withdrawalAction.isPending}
        error={approveError}
      />

      <Dialog open={rejectTarget !== null} onOpenChange={open => !open && setRejectTarget(null)}>
        <DialogContent className="max-w-md" onCloseAutoFocus={returnFocusAfterReject}>
          <DialogHeader>
            <DialogTitle>{t('admin.withdrawals.rejectTitle')}</DialogTitle>
            <DialogDescription>
              {t('admin.withdrawals.rejectBody', { label: rejectTarget?.label ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            placeholder={t('admin.withdrawals.rejectPlaceholder')}
            onChange={event => setRejectReason(event.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRejectTarget(null)}>{t('common.cancel')}</Button>
            <Button
              variant="destructive"
              disabled={isActing || rejectReason.trim().length < 3}
              onClick={submitReject}
            >
              {t('admin.withdrawals.reject')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface SectionProps {
  title: string
  hint: string
  action?: ReactNode
  children: ReactNode
}

function Section({ title, hint, action, children }: SectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-muted-foreground text-sm">{hint}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

interface BalanceCardProps {
  label: string
  hint: string
  value: string
  isLoading: boolean
  highlight?: boolean
}

function BalanceCard({ label, hint, value, isLoading, highlight = false }: BalanceCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading
          ? <Skeleton className="h-8 w-32" />
          : <p className={`font-mono text-2xl font-bold ${highlight ? 'text-primary' : ''}`}>{value}</p>}
        <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
      </CardContent>
    </Card>
  )
}
