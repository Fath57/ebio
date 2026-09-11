import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type {
  PlatformAccount,
  PlatformMonthlyPoint,
  PlatformPeriod,
  PlatformTransaction,
} from '../utils/platform-accounts-queries'
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
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  COST_CENTRE_ACCOUNTS,
  fetchPlatformAccountsQueryOptions,
  fetchPlatformAccountTransactionsQueryOptions,
  PLATFORM_ACCOUNTS,
  PLATFORM_PERIODS,
  platformPeriodRange,
} from '../utils/platform-accounts-queries'

function formatAmount(value: number): string {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

/** Period movements always carry their sign, so a gain reads as a gain. */
function formatSignedAmount(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toLocaleString('fr-FR')} FCFA`
}

function amountToneClass(value: number): string {
  if (value < 0)
    return 'text-ebio-coral-600'
  if (value > 0)
    return 'text-ebio-green-600'
  return 'text-muted-foreground'
}

interface AccountCardProps {
  account: PlatformAccount
  label: string
  hint: string
  balance: number
  periodAmount: number
  periodLabel: string
  onSelect: (account: PlatformAccount) => void
}

function AccountCard({
  account,
  label,
  hint,
  balance,
  periodAmount,
  periodLabel,
  onSelect,
}: AccountCardProps) {
  const isCostCentre = COST_CENTRE_ACCOUNTS.includes(account)
  const balanceClass = isCostCentre ? 'text-ebio-coral-600' : 'text-ebio-green-600'

  return (
    <Card
      role="button"
      tabIndex={0}
      className="hover:border-primary cursor-pointer transition-colors"
      onClick={() => onSelect(account)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ')
          onSelect(account)
      }}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold ${balanceClass}`}>{formatAmount(balance)}</p>
        <p className="mt-1 text-xs">
          <span className="text-muted-foreground">{`${periodLabel} : `}</span>
          <span className={amountToneClass(periodAmount)}>{formatSignedAmount(periodAmount)}</span>
        </p>
      </CardContent>
    </Card>
  )
}

interface MonthlyBarsProps {
  points: PlatformMonthlyPoint[]
  emptyLabel: string
  locale: string
}

function MonthlyBars({ points, emptyLabel, locale }: MonthlyBarsProps) {
  if (points.length === 0)
    return <p className="text-muted-foreground text-sm">{emptyLabel}</p>

  const max = Math.max(...points.map(point => Math.abs(point.net)), 1)

  return (
    <div className="space-y-2">
      {points.map((point) => {
        const [year, month] = point.month.split('-')
        const monthDate = new Date(Number(year), Number(month) - 1, 1)
        const width = `${Math.max((Math.abs(point.net) / max) * 100, 2)}%`
        const barClass = point.net < 0 ? 'bg-ebio-coral-400' : 'bg-ebio-green-400'

        return (
          <div key={point.month} className="flex items-center gap-3">
            <span className="text-muted-foreground w-24 shrink-0 text-xs">
              {monthDate.toLocaleDateString(locale, { month: 'short', year: 'numeric' })}
            </span>
            <div className="bg-muted h-3 flex-1 overflow-hidden rounded-full">
              <div className={`h-full rounded-full ${barClass}`} style={{ width }} />
            </div>
            <span className={`w-36 shrink-0 text-right text-xs font-medium ${amountToneClass(point.net)}`}>
              {formatSignedAmount(point.net)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

interface AccountLedgerProps {
  account: PlatformAccount
}

function AccountLedger({ account }: AccountLedgerProps) {
  const { t, i18n } = useTranslation()
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery(
    fetchPlatformAccountTransactionsQueryOptions(account, page),
  )

  const columns = useMemo<Array<ColumnDef<PlatformTransaction, unknown>>>(() => [
    {
      id: 'createdAt',
      header: t('admin.platformAccounts.columns.date'),
      enableSorting: false,
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(i18n.language),
    },
    {
      id: 'type',
      header: t('admin.platformAccounts.columns.type'),
      enableSorting: false,
      cell: ({ row }) => t(
        `admin.platformAccounts.types.${row.original.type}`,
        { defaultValue: row.original.type },
      ),
    },
    {
      id: 'description',
      header: t('admin.platformAccounts.columns.description'),
      enableSorting: false,
      cell: ({ row }) => row.original.description,
    },
    {
      id: 'amount',
      header: t('admin.platformAccounts.columns.amount'),
      enableSorting: false,
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className={`font-medium ${amountToneClass(row.original.amount)}`}>
          {formatSignedAmount(row.original.amount)}
        </span>
      ),
    },
    {
      id: 'balanceAfter',
      header: t('admin.platformAccounts.columns.balanceAfter'),
      enableSorting: false,
      meta: { align: 'right' },
      cell: ({ row }) => formatAmount(row.original.balanceAfter),
    },
  ], [t, i18n.language])

  const items = data?.items ?? []
  const limit = data?.limit ?? 20

  return (
    <DataTable
      columns={columns}
      data={items}
      total={data?.total ?? items.length}
      page={data?.page ?? page}
      pageSize={limit}
      onPageChange={setPage}
      sorting={[]}
      onSortingChange={() => {}}
      isLoading={isLoading}
      labels={{
        empty: t('admin.platformAccounts.ledgerEmpty'),
        resultCount: count => t('dataTable.resultCount', { count }),
        pageOf: (current, lastPage) => t('dataTable.pageOf', { page: current, lastPage }),
        previous: t('dataTable.previous'),
        next: t('dataTable.next'),
      }}
    />
  )
}

export default function PlatformAccountsPage() {
  const { t, i18n } = useTranslation()
  const [period, setPeriod] = useState<PlatformPeriod>('thisMonth')
  const [openAccount, setOpenAccount] = useState<PlatformAccount | null>(null)

  const range = useMemo(() => platformPeriodRange(period), [period])
  const { data, isLoading } = useQuery(fetchPlatformAccountsQueryOptions(range))

  const balances = useMemo(() => {
    const map = new Map(data?.accounts.map(entry => [entry.account, entry]) ?? [])
    return PLATFORM_ACCOUNTS.map(account => ({
      account,
      balance: map.get(account)?.balance ?? 0,
      periodAmount: map.get(account)?.periodAmount ?? 0,
    }))
  }, [data])

  const periodLabel = t(`admin.platformAccounts.periods.${period}`)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t('admin.platformAccounts.title')}</h2>
        <p className="text-muted-foreground">{t('admin.platformAccounts.description')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PLATFORM_PERIODS.map(item => (
          <Button
            key={item}
            variant={item === period ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriod(item)}
          >
            {t(`admin.platformAccounts.periods.${item}`)}
          </Button>
        ))}
      </div>

      {isLoading
        ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          )
        : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {balances.map(entry => (
                <AccountCard
                  key={entry.account}
                  account={entry.account}
                  label={t(`admin.platformAccounts.accounts.${entry.account}.label`)}
                  hint={t(`admin.platformAccounts.accounts.${entry.account}.hint`)}
                  balance={entry.balance}
                  periodAmount={entry.periodAmount}
                  periodLabel={periodLabel}
                  onSelect={setOpenAccount}
                />
              ))}
            </div>
          )}

      <Card>
        <CardContent className="flex flex-wrap items-baseline justify-between gap-4 py-4">
          <div>
            <p className="text-muted-foreground text-sm">{t('admin.platformAccounts.net')}</p>
            <p className="text-muted-foreground text-xs">{t('admin.platformAccounts.netHint')}</p>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-bold ${amountToneClass(data?.netBalance ?? 0)}`}>
              {formatAmount(data?.netBalance ?? 0)}
            </p>
            <p className="text-xs">
              <span className="text-muted-foreground">{`${periodLabel} : `}</span>
              <span className={amountToneClass(data?.netPeriod ?? 0)}>
                {formatSignedAmount(data?.netPeriod ?? 0)}
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.platformAccounts.monthly')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading
            ? <Skeleton className="h-24" />
            : (
                <MonthlyBars
                  points={data?.monthly ?? []}
                  emptyLabel={t('admin.platformAccounts.monthlyEmpty')}
                  locale={i18n.language}
                />
              )}
        </CardContent>
      </Card>

      <Dialog
        open={openAccount !== null}
        onOpenChange={(open) => {
          if (!open)
            setOpenAccount(null)
        }}
      >
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {openAccount
                ? t(`admin.platformAccounts.accounts.${openAccount}.label`)
                : t('admin.platformAccounts.title')}
            </DialogTitle>
            <DialogDescription>{t('admin.platformAccounts.ledgerDescription')}</DialogDescription>
          </DialogHeader>
          {openAccount && <AccountLedger key={openAccount} account={openAccount} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
