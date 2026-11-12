import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { ReactNode } from 'react'
import type { AdminPayoutNumber, AdminWithdrawal } from '../utils/withdrawals-queries'
import type { StatusTone } from '@/features/admin/common/components/status-badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { DataTable } from '@boilerstone/ui/components/primitives/data-table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@boilerstone/ui/components/primitives/dialog'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router'
import { ConfirmDialog } from '@/features/admin/common/components/confirm-dialog'
import { FilterSelect } from '@/features/admin/common/components/filter-select'
import { StatusBadge } from '@/features/admin/common/components/status-badge'
import { StatusTabs } from '@/features/admin/common/components/status-tabs'
import { useDataTableLabels } from '@/features/admin/common/utils/use-data-table-labels'
import { useListParams } from '@/features/admin/common/utils/use-list-params'
import { useReturnFocus } from '@/features/admin/common/utils/use-return-focus'
import { formatAmount } from '@/features/admin/wallets/utils/format-amount'
import { Can } from '@/lib/casl/can'
import { BeneficiaryCell } from '../components/beneficiary-cell'
import {
  actOnPayoutNumber,
  actOnWithdrawal,
  fetchAdminWithdrawalsQueryOptions,
  fetchPayoutNumbersQueryOptions,
} from '../utils/withdrawals-queries'

const PAGE_SIZE = 20

/** The two jobs of the page: pay what is asked, trust the numbers it goes to. */
const SECTIONS = ['demandes', 'numeros'] as const

/** Tabs that became pages of their own; old links still land on them. */
const MOVED_SECTIONS: Record<string, string> = {
  portefeuilles: '/admin/portefeuilles',
  recharges: '/admin/recharges',
}
type Section = typeof SECTIONS[number]

const WITHDRAWAL_STATUSES = ['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REJECTED', 'CANCELLED']

const WITHDRAWAL_TONES: Record<string, StatusTone> = {
  PENDING: 'action',
  PROCESSING: 'progress',
  PAID: 'done',
  FAILED: 'problem',
  REJECTED: 'idle',
  CANCELLED: 'idle',
}

function useWithdrawalsParams() {
  return useListParams({
    defaultSort: 'createdAt',
    filters: ['onglet', 'statutDemande'],
    defaults: { onglet: 'demandes', statutDemande: 'PENDING' },
  })
}

type ListParams = ReturnType<typeof useWithdrawalsParams>

/**
 * Money leaving eBio: payout requests to approve and the Mobile Money numbers
 * they go to. Wallets and topups have their own pages.
 */
export default function AdminWithdrawalsPage() {
  const { t } = useTranslation()
  const list = useWithdrawalsParams()
  const section: Section = (SECTIONS as readonly string[]).includes(list.values.onglet) ? list.values.onglet as Section : 'demandes'

  // Counts for the tabs: cheap first pages, whatever tab is open.
  const pendingRequests = useQuery(fetchAdminWithdrawalsQueryOptions('PENDING', 1))
  const pendingNumbers = useQuery(fetchPayoutNumbersQueryOptions('PENDING', 1))

  const changeSection = (next: string) => {
    list.setFilters({ onglet: next })
  }

  const moved = MOVED_SECTIONS[list.values.onglet]
  if (moved)
    return <Navigate to={moved} replace />

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold">{t('admin.withdrawals.title')}</h2>
        <p className="text-muted-foreground">{t('admin.withdrawals.description')}</p>
      </div>

      <StatusTabs
        allTab={false}
        tabs={[
          { value: 'demandes', label: t('admin.withdrawals.sections.demandes'), tone: 'action' },
          { value: 'numeros', label: t('admin.withdrawals.sections.numeros'), tone: 'action' },
        ]}
        value={section}
        onChange={changeSection}
        counts={{
          ...(pendingRequests.data ? { demandes: pendingRequests.data.total } : {}),
          ...(pendingNumbers.data ? { numeros: pendingNumbers.data.total } : {}),
        }}
      />

      {section === 'demandes' && <RequestsSection list={list} />}
      {section === 'numeros' && <NumbersSection list={list} />}
    </div>
  )
}

/** Shared by numbers and requests: the money did not move, so the reason is all the owner gets. */
interface RejectTarget {
  kind: 'number' | 'withdrawal'
  id: string
  label: string
}

function useInvalidateMoney() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'payout-numbers'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'withdrawals'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'wallets'] })
  }
}

function RequestsSection({ list }: { list: ListParams }) {
  const { t, i18n } = useTranslation()
  const invalidate = useInvalidateMoney()
  const status = list.values.statutDemande
  const labels = useDataTableLabels(t('admin.withdrawals.requestsEmpty'))
  const [approveTarget, setApproveTarget] = useState<AdminWithdrawal | null>(null)
  const [approveError, setApproveError] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null)

  const query = useQuery({
    ...fetchAdminWithdrawalsQueryOptions(status || undefined, list.page),
    placeholderData: keepPreviousData,
  })

  const action = useMutation({
    mutationFn: ({ id, kind, reason }: { id: string, kind: 'approve' | 'reject', reason?: string }) => actOnWithdrawal(id, kind, reason),
    onSuccess: () => {
      setApproveTarget(null)
      setRejectTarget(null)
      setApproveError(null)
      invalidate()
    },
    // A failed payout re-credits the owner automatically; surface why.
    onError: (error: Error) => {
      setApproveError(error.message)
      invalidate()
    },
  })

  const columns = useMemo<Array<ColumnDef<AdminWithdrawal, unknown>>>(() => [
    {
      id: 'createdAt',
      header: t('admin.withdrawals.columns.date'),
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(i18n.language),
    },
    {
      id: 'beneficiary',
      header: t('admin.withdrawals.columns.beneficiary'),
      cell: ({ row }) => <BeneficiaryCell {...row.original} />,
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
          {row.original.failureReason && (
            <span className="text-ebio-coral-600 text-xs whitespace-normal">
              {t('admin.withdrawals.providerFailure', { reason: row.original.failureReason })}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => row.original.status === 'PENDING' && (
        <Can action="manage" subject="Withdrawal">
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={action.isPending}
              onClick={() => setRejectTarget({ kind: 'withdrawal', id: row.original.id, label: `${formatAmount(row.original.amount)} — ${row.original.ownerName}` })}
            >
              {t('admin.withdrawals.reject')}
            </Button>
            <Button
              size="sm"
              disabled={action.isPending}
              onClick={() => {
                setApproveError(null)
                setApproveTarget(row.original)
              }}
            >
              {t('admin.withdrawals.approve')}
            </Button>
          </div>
        </Can>
      ),
    },
  ], [t, i18n.language, action.isPending])

  return (
    <section className="space-y-4">
      <SectionToolbar hint={t('admin.withdrawals.requestsHint')}>
        <FilterSelect
          value={status}
          onValueChange={value => list.setFilter('statutDemande', value)}
          allLabel={t('admin.withdrawals.allStatuses')}
          ariaLabel={t('admin.withdrawals.columns.status')}
          options={WITHDRAWAL_STATUSES.map(value => ({ value, label: t(`admin.withdrawals.status.${value}`) }))}
        />
      </SectionToolbar>
      {approveError && !approveTarget && (
        <p className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border p-3 text-sm" role="alert">{approveError}</p>
      )}
      <DataTable
        columns={columns}
        data={query.data?.items ?? []}
        total={query.data?.total ?? 0}
        page={list.page}
        pageSize={query.data?.limit ?? PAGE_SIZE}
        onPageChange={list.setPage}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        isError={query.isError}
        onRetry={() => query.refetch()}
        labels={labels}
      />

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
        onConfirm={() => approveTarget && action.mutate({ id: approveTarget.id, kind: 'approve' })}
        isPending={action.isPending}
        error={approveError}
      />
      <RejectDialog
        target={rejectTarget}
        onClose={() => setRejectTarget(null)}
        onSubmit={reason => rejectTarget && action.mutate({ id: rejectTarget.id, kind: 'reject', reason })}
        isPending={action.isPending}
      />
    </section>
  )
}

function NumbersSection({ list }: { list: ListParams }) {
  const { t } = useTranslation()
  const invalidate = useInvalidateMoney()
  const labels = useDataTableLabels(t('admin.withdrawals.numbersEmpty'))
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null)

  const query = useQuery({
    ...fetchPayoutNumbersQueryOptions('PENDING', list.page),
    placeholderData: keepPreviousData,
  })
  const action = useMutation({
    mutationFn: ({ id, kind, reason }: { id: string, kind: 'validate' | 'reject', reason?: string }) => actOnPayoutNumber(id, kind, reason),
    onSuccess: () => {
      setRejectTarget(null)
      invalidate()
    },
    onError: (error: Error) => toast.error(error.message || t('common.error')),
  })

  const columns = useMemo<Array<ColumnDef<AdminPayoutNumber, unknown>>>(() => [
    {
      id: 'beneficiary',
      header: t('admin.withdrawals.columns.beneficiary'),
      cell: ({ row }) => <BeneficiaryCell {...row.original} />,
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
        <Can action="manage" subject="Withdrawal">
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={action.isPending}
              onClick={() => setRejectTarget({ kind: 'number', id: row.original.id, label: row.original.phoneNumber })}
            >
              <XCircle className="text-destructive mr-1 h-4 w-4" />
              {t('admin.withdrawals.reject')}
            </Button>
            <Button variant="outline" size="sm" disabled={action.isPending} onClick={() => action.mutate({ id: row.original.id, kind: 'validate' })}>
              <CheckCircle2 className="text-ebio-green-600 mr-1 h-4 w-4" />
              {t('admin.withdrawals.validate')}
            </Button>
          </div>
        </Can>
      ),
    },
  ], [t, action])

  return (
    <section className="space-y-4">
      <SectionToolbar hint={t('admin.withdrawals.numbersHint')} />
      <DataTable
        columns={columns}
        data={query.data?.items ?? []}
        total={query.data?.total ?? 0}
        page={list.page}
        pageSize={query.data?.limit ?? PAGE_SIZE}
        onPageChange={list.setPage}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        isError={query.isError}
        onRetry={() => query.refetch()}
        labels={labels}
      />
      <RejectDialog
        target={rejectTarget}
        onClose={() => setRejectTarget(null)}
        onSubmit={reason => rejectTarget && action.mutate({ id: rejectTarget.id, kind: 'reject', reason })}
        isPending={action.isPending}
      />
    </section>
  )
}

function SectionToolbar({ hint, children }: { hint: string, children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground max-w-2xl text-sm">{hint}</p>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </div>
  )
}

function RejectDialog({ target, onClose, onSubmit, isPending }: {
  target: RejectTarget | null
  onClose: () => void
  onSubmit: (reason: string) => void
  isPending: boolean
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const returnFocus = useReturnFocus(target !== null)

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          setReason('')
          onClose()
        }
      }}
    >
      <DialogContent className="max-w-md" onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>{t('admin.withdrawals.rejectTitle')}</DialogTitle>
          <DialogDescription>{t('admin.withdrawals.rejectBody', { label: target?.label ?? '' })}</DialogDescription>
        </DialogHeader>
        <Textarea value={reason} placeholder={t('admin.withdrawals.rejectPlaceholder')} onChange={event => setReason(event.target.value)} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="destructive" disabled={isPending || reason.trim().length < 3} onClick={() => onSubmit(reason.trim())}>
            {t('admin.withdrawals.reject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
