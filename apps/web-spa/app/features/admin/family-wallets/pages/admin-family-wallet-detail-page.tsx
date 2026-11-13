import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { TFunction } from 'i18next'
import type { AdminFamilyMember, AdminFamilyTransaction, AdminFamilyWalletDetail, FamilyLimits, FamilyStatusAction } from '../utils/family-wallets-queries'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { DataTable } from '@boilerstone/ui/components/primitives/data-table'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pause, Play, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { BackLink } from '@/features/admin/common/components/back-link'
import { useDataTableLabels } from '@/features/admin/common/utils/use-data-table-labels'
import { formatAmount, formatSignedAmount } from '@/features/admin/wallets/utils/format-amount'
import { Can } from '@/lib/casl/can'
import { FamilyReasonDialog } from '../components/family-reason-dialog'
import { FamilyMemberStatusBadge, FamilyWalletStatusBadge } from '../components/family-status-badge'
import { applyFamilyStatusAction, familyWalletDetailQueryKey, fetchFamilyWalletQueryOptions } from '../utils/family-wallets-queries'

interface PendingAction {
  action: FamilyStatusAction
  /** Who the dialog is about: the payer's name or the member's nickname. */
  name: string
}

function amountToneClass(value: number): string {
  if (value < 0)
    return 'text-ebio-coral-600'
  if (value > 0)
    return 'text-ebio-green-600'
  return 'text-muted-foreground'
}

/**
 * One family wallet as the staff see it: who pays, what is left, the limits
 * every relative spends under, and the last ledger lines. Suspending the
 * wallet or a member needs a reason — it goes to the audit trail.
 */
export default function AdminFamilyWalletDetailPage() {
  const { t, i18n } = useTranslation()
  const { familyWalletId = '' } = useParams()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<PendingAction | null>(null)

  const wallet = useQuery(fetchFamilyWalletQueryOptions(familyWalletId))

  const mutation = useMutation({
    mutationFn: ({ action, reason }: { action: FamilyStatusAction, reason: string }) => applyFamilyStatusAction(action, reason),
    onSuccess: (detail, { action }) => {
      queryClient.setQueryData(familyWalletDetailQueryKey(familyWalletId), detail)
      queryClient.invalidateQueries({ queryKey: ['admin', 'family-wallets', 'list'] })
      toast.success(t(`admin.familyWallets.done.${action.target}.${action.kind}`))
      setPending(null)
    },
    onError: (error) => {
      toast.error(error.message || t('admin.familyWallets.done.error'))
    },
  })

  const data = wallet.data
  const isClosed = data?.status === 'CLOSED'

  return (
    <div className="space-y-6">
      <BackLink fallback="/admin/portefeuilles-famille" />

      {wallet.isError && (
        <p className="text-destructive" role="alert">{t('admin.familyWallets.detail.notFound')}</p>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
          {data
            ? (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/admin/utilisateurs/${data.payer.id}`} className="text-lg font-semibold hover:underline">
                      {data.payer.name}
                    </Link>
                    <FamilyWalletStatusBadge status={data.status} suspendedByAdmin={data.suspendedByAdmin} />
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {[data.payer.phone, data.payer.email].filter(Boolean).join(' · ')}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {data.closedAt
                      ? t('admin.familyWallets.detail.closedAt', { date: new Date(data.closedAt).toLocaleDateString(i18n.language) })
                      : t('admin.familyWallets.detail.createdAt', { date: new Date(data.createdAt).toLocaleDateString(i18n.language) })}
                  </p>
                </div>
              )
            : <Skeleton className="h-14 w-64" />}
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-right">
              <p className="text-muted-foreground text-sm">{t('admin.familyWallets.columns.balance')}</p>
              {data
                ? <p className="font-mono text-2xl font-bold">{formatAmount(data.balance)}</p>
                : <Skeleton className="h-8 w-32" />}
              {data && (
                <p className="text-muted-foreground text-xs">
                  {t('admin.familyWallets.detail.lowBalance', { amount: formatAmount(data.lowBalanceThreshold) })}
                </p>
              )}
            </div>
            {data && data.walletId && (
              <Button variant="ghost" size="sm" asChild>
                <Link to={`/admin/portefeuilles/${data.walletId}`}>
                  <Wallet className="mr-1 h-4 w-4" />
                  {t('admin.familyWallets.detail.ledger')}
                </Link>
              </Button>
            )}
            {data && !isClosed && (
              <Can action="manage" subject="Payment">
                {data.status === 'SUSPENDED'
                  ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPending({ action: { target: 'wallet', kind: 'resume', id: data.id }, name: data.payer.name })}
                      >
                        <Play className="mr-1 h-4 w-4" />
                        {t('admin.familyWallets.actions.wallet.resume')}
                      </Button>
                    )
                  : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPending({ action: { target: 'wallet', kind: 'suspend', id: data.id }, name: data.payer.name })}
                      >
                        <Pause className="mr-1 h-4 w-4" />
                        {t('admin.familyWallets.actions.wallet.suspend')}
                      </Button>
                    )}
              </Can>
            )}
          </div>
        </CardContent>
      </Card>

      {data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('admin.familyWallets.detail.defaults')}</CardTitle>
            <p className="text-muted-foreground text-sm">{t('admin.familyWallets.detail.defaultsHint')}</p>
          </CardHeader>
          <CardContent>
            <LimitsSummary limits={data.defaults} />
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('admin.familyWallets.detail.members')}</h2>
        <MembersTable
          wallet={data}
          isLoading={wallet.isLoading}
          onAction={(member, kind) => setPending({ action: { target: 'member', kind, id: member.id }, name: member.nickname })}
        />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{t('admin.familyWallets.detail.transactions')}</h2>
          {data && data.transactions.total > data.transactions.items.length && data.walletId && (
            <Link to={`/admin/portefeuilles/${data.walletId}`} className="text-ebio-blue-600 text-sm hover:underline dark:text-ebio-blue-200">
              {t('admin.familyWallets.detail.allTransactions', { count: data.transactions.total })}
            </Link>
          )}
        </div>
        <TransactionsTable items={data?.transactions.items ?? []} isLoading={wallet.isLoading} />
      </section>

      {pending && (
        <FamilyReasonDialog
          key={`${pending.action.target}-${pending.action.kind}-${pending.action.id}`}
          open
          kind={pending.action.kind}
          title={t(`admin.familyWallets.actions.${pending.action.target}.${pending.action.kind}`)}
          description={t(`admin.familyWallets.actions.${pending.action.target}.${pending.action.kind}Confirm`, { name: pending.name })}
          isPending={mutation.isPending}
          onConfirm={reason => mutation.mutate({ action: pending.action, reason })}
          onClose={() => setPending(null)}
        />
      )}
    </div>
  )
}

function LimitsSummary({ limits }: { limits: FamilyLimits }) {
  const { t } = useTranslation()
  return (
    <dl className="grid gap-4 sm:grid-cols-3">
      <div>
        <dt className="text-muted-foreground text-sm">{t('admin.familyWallets.limits.monthlyCap')}</dt>
        <dd className="font-mono font-medium">{formatLimit(limits.monthlyCap, t('admin.familyWallets.limits.none'))}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-sm">{t('admin.familyWallets.limits.orderMax')}</dt>
        <dd className="font-mono font-medium">{formatLimit(limits.orderMax, t('admin.familyWallets.limits.none'))}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-sm">{t('admin.familyWallets.limits.categories')}</dt>
        <dd className="font-medium">{formatCategories(limits.categoryIds, t)}</dd>
      </div>
    </dl>
  )
}

function formatLimit(value: number | null, none: string): string {
  return value == null ? none : formatAmount(value)
}

function formatCategories(categoryIds: string[] | null, t: TFunction): string {
  return categoryIds == null
    ? t('admin.familyWallets.limits.allCategories')
    : t('admin.familyWallets.limits.categoryCount', { count: categoryIds.length })
}

interface MembersTableProps {
  wallet: AdminFamilyWalletDetail | undefined
  isLoading: boolean
  onAction: (member: AdminFamilyMember, kind: 'suspend' | 'resume') => void
}

function MembersTable({ wallet, isLoading, onAction }: MembersTableProps) {
  const { t, i18n } = useTranslation()
  const labels = useDataTableLabels(t('admin.familyWallets.detail.membersEmpty'))
  const walletOpen = wallet != null && wallet.status !== 'CLOSED'

  const columns = useMemo<Array<ColumnDef<AdminFamilyMember, unknown>>>(() => [
    {
      id: 'member',
      header: t('admin.familyWallets.columns.member'),
      cell: ({ row }) => (
        <div className="min-w-0">
          {row.original.userId
            ? (
                <Link to={`/admin/utilisateurs/${row.original.userId}`} className="font-medium hover:underline">
                  {row.original.nickname}
                </Link>
              )
            : <p className="font-medium">{row.original.nickname}</p>}
          <p className="text-muted-foreground text-xs">{row.original.phone}</p>
        </div>
      ),
    },
    {
      id: 'status',
      header: t('admin.familyWallets.columns.status'),
      cell: ({ row }) => <FamilyMemberStatusBadge status={row.original.status} suspendedByAdmin={row.original.suspendedByAdmin} />,
    },
    {
      id: 'limits',
      header: t('admin.familyWallets.columns.limits'),
      meta: { hideBelow: 'md' },
      cell: ({ row }) => {
        const { monthlyCap, orderMax, categoryIds } = row.original.effective
        const none = t('admin.familyWallets.limits.none')
        return (
          <div className="space-y-0.5 text-xs">
            <p>{t('admin.familyWallets.limits.monthlyShort', { amount: formatLimit(monthlyCap, none) })}</p>
            <p>{t('admin.familyWallets.limits.orderShort', { amount: formatLimit(orderMax, none) })}</p>
            <p className="text-muted-foreground">{formatCategories(categoryIds, t)}</p>
          </div>
        )
      },
    },
    {
      id: 'spent',
      header: t('admin.familyWallets.columns.spentThisMonth'),
      meta: { numeric: true },
      cell: ({ row }) => <span className="font-mono">{formatAmount(row.original.spentThisMonth)}</span>,
    },
    {
      id: 'createdAt',
      header: t('admin.familyWallets.columns.addedAt'),
      meta: { hideBelow: 'lg' },
      cell: ({ row }) => (
        <span className="text-muted-foreground">{new Date(row.original.createdAt).toLocaleDateString(i18n.language)}</span>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => {
        const member = row.original
        if (!walletOpen || (member.status !== 'ACTIVE' && member.status !== 'SUSPENDED'))
          return null
        const kind = member.status === 'SUSPENDED' ? 'resume' : 'suspend'
        return (
          <Can action="manage" subject="Payment">
            <Button variant="outline" size="sm" onClick={() => onAction(member, kind)}>
              {kind === 'resume' ? <Play className="mr-1 h-4 w-4" /> : <Pause className="mr-1 h-4 w-4" />}
              {t(`admin.familyWallets.actions.member.${kind}`)}
            </Button>
          </Can>
        )
      },
    },
  ], [t, i18n.language, walletOpen, onAction])

  return (
    <DataTable
      columns={columns}
      data={wallet?.members ?? []}
      total={wallet?.members.length ?? 0}
      page={1}
      pageSize={Math.max(wallet?.members.length ?? 0, 1)}
      onPageChange={() => {}}
      isLoading={isLoading}
      labels={labels}
    />
  )
}

function TransactionsTable({ items, isLoading }: { items: AdminFamilyTransaction[], isLoading: boolean }) {
  const { t, i18n } = useTranslation()
  const labels = useDataTableLabels(t('admin.familyWallets.detail.transactionsEmpty'))

  const columns = useMemo<Array<ColumnDef<AdminFamilyTransaction, unknown>>>(() => [
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
      id: 'member',
      header: t('admin.familyWallets.columns.member'),
      cell: ({ row }) => row.original.member?.nickname ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'order',
      header: t('admin.familyWallets.columns.order'),
      meta: { hideBelow: 'md' },
      cell: ({ row }) => {
        const { order } = row.original
        if (!order)
          return <span className="text-muted-foreground">—</span>
        return (
          <div className="min-w-0">
            <Link to={`/admin/commandes/${order.id}`} className="font-medium hover:underline">
              {order.orderNumber}
            </Link>
            <p className="text-muted-foreground truncate text-xs">{order.shopName}</p>
          </div>
        )
      },
    },
    {
      id: 'amount',
      header: t('admin.wallets.columns.amount'),
      meta: { numeric: true },
      cell: ({ row }) => (
        <span className={`font-mono font-medium ${amountToneClass(row.original.amount)}`}>{formatSignedAmount(row.original.amount)}</span>
      ),
    },
    {
      id: 'balanceAfter',
      header: t('admin.wallets.columns.balanceAfter'),
      meta: { numeric: true, hideBelow: 'md' },
      cell: ({ row }) => <span className="font-mono">{formatAmount(row.original.balanceAfter)}</span>,
    },
  ], [t, i18n.language])

  return (
    <DataTable
      columns={columns}
      data={items}
      total={items.length}
      page={1}
      pageSize={Math.max(items.length, 1)}
      onPageChange={() => {}}
      isLoading={isLoading}
      labels={labels}
    />
  )
}
