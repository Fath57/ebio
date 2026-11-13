import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { AdminWalletListItem } from '../utils/wallets-queries'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { MinusCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { FilterSelect } from '@/features/admin/common/components/filter-select'
import { useListParams } from '@/features/admin/common/utils/use-list-params'
import { BeneficiaryCell } from '@/features/admin/withdrawals/components/beneficiary-cell'
import { Can } from '@/lib/casl/can'
import { DebitDialog } from '../components/debit-dialog'
import { formatAmount } from '../utils/format-amount'
import { fetchWalletsListQueryOptions, WALLETS_PAGE_SIZE } from '../utils/wallets-queries'

const OWNER_TYPES = ['SUPPLIER', 'COURIER', 'USER', 'FAMILY'] as const
const BALANCES = ['positive', 'negative', 'zero'] as const

/**
 * What every account holds: shops, couriers, buyers and family wallets, the
 * biggest balance first. A row opens the wallet's history — a family wallet
 * opens its own page, with members and limits; staff with the right can debit it.
 */
export default function AdminWalletsPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const list = useListParams({ defaultSort: 'balance', filters: ['type', 'solde', 'ordre'] })
  const [debitTarget, setDebitTarget] = useState<AdminWalletListItem | null>(null)

  // Totals over every wallet, whatever the filters: the two cards never move with them.
  const everyWallet = useQuery(fetchWalletsListQueryOptions({ page: 1 }))
  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    ...fetchWalletsListQueryOptions({
      q: list.q || undefined,
      ownerType: list.values.type || undefined,
      balance: list.values.solde || undefined,
      sort: list.values.ordre || undefined,
      page: list.page,
    }),
    placeholderData: keepPreviousData,
  })

  const columns = useMemo<Array<ColumnDef<AdminWalletListItem, unknown>>>(() => [
    {
      id: 'beneficiary',
      header: t('admin.wallets.columns.owner'),
      cell: ({ row }) => <BeneficiaryCell {...row.original} />,
    },
    {
      id: 'balance',
      header: t('admin.wallets.columns.balance'),
      meta: { numeric: true },
      cell: ({ row }) => (
        <span className={row.original.balance < 0 ? 'text-ebio-coral-600 font-medium' : 'font-medium'}>{formatAmount(row.original.balance)}</span>
      ),
    },
    {
      id: 'updatedAt',
      header: t('admin.wallets.columns.updatedAt'),
      meta: { hideBelow: 'md' },
      cell: ({ row }) => <span className="text-muted-foreground">{new Date(row.original.updatedAt).toLocaleDateString(i18n.language)}</span>,
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => row.original.balance > 0 && (
        <Can action="manage" subject="Withdrawal">
          <Button
            variant="outline"
            size="sm"
            onClick={(event) => {
              event.stopPropagation()
              setDebitTarget(row.original)
            }}
          >
            <MinusCircle className="mr-1 h-4 w-4" />
            {t('admin.wallets.debit.action')}
          </Button>
        </Can>
      ),
    },
  ], [t, i18n.language])

  return (
    <>
      <AdminListShell
        title={t('admin.wallets.title')}
        description={t('admin.wallets.description')}
        summary={(
          <div className="grid gap-4 sm:grid-cols-2">
            <BalanceCard
              label={t('admin.wallets.totalOwed')}
              hint={t('admin.wallets.totalOwedHint')}
              value={formatAmount(everyWallet.data?.totalOwed ?? 0)}
              isLoading={everyWallet.isLoading}
              highlight
            />
            <BalanceCard
              label={t('admin.wallets.totalDebt')}
              hint={t('admin.wallets.totalDebtHint')}
              value={formatAmount(everyWallet.data?.totalDebt ?? 0)}
              isLoading={everyWallet.isLoading}
            />
          </div>
        )}
        searchValue={list.q}
        onSearchChange={list.setSearch}
        searchPlaceholder={t('admin.wallets.search')}
        filters={(
          <>
            <FilterSelect
              value={list.values.type}
              onValueChange={value => list.setFilter('type', value)}
              allLabel={t('admin.wallets.allOwners')}
              ariaLabel={t('admin.wallets.columns.owner')}
              options={OWNER_TYPES.map(value => ({ value, label: t(`admin.withdrawals.ownerTypes.${value}`) }))}
            />
            <FilterSelect
              value={list.values.solde}
              onValueChange={value => list.setFilter('solde', value)}
              allLabel={t('admin.wallets.allBalances')}
              ariaLabel={t('admin.wallets.columns.balance')}
              options={BALANCES.map(value => ({ value, label: t(`admin.wallets.balances.${value}`) }))}
            />
            <FilterSelect
              value={list.values.ordre}
              onValueChange={value => list.setFilter('ordre', value)}
              allLabel={t('admin.wallets.sorts.balance_desc')}
              ariaLabel={t('admin.wallets.sortLabel')}
              options={['balance_asc', 'updated_desc'].map(value => ({ value, label: t(`admin.wallets.sorts.${value}`) }))}
            />
            {data && list.isFiltered && (
              <p className="text-muted-foreground text-sm">
                {t('admin.wallets.filteredTotals', { owed: formatAmount(data.totalOwed), debt: formatAmount(data.totalDebt) })}
              </p>
            )}
          </>
        )}
        onResetFilters={list.reset}
        columns={columns}
        data={data?.items ?? []}
        total={data?.total ?? 0}
        page={list.page}
        pageSize={WALLETS_PAGE_SIZE}
        onPageChange={list.setPage}
        onRowClick={wallet => navigate(wallet.ownerType === 'FAMILY' && wallet.familyWalletId
          ? `/admin/portefeuilles-famille/${wallet.familyWalletId}`
          : `/admin/portefeuilles/${wallet.id}`)}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        onRetry={() => refetch()}
        emptyLabel={t('admin.wallets.empty')}
      />
      <DebitDialog wallet={debitTarget} onClose={() => setDebitTarget(null)} />
    </>
  )
}

function BalanceCard({ label, hint, value, isLoading, highlight = false }: { label: string, hint: string, value: string, isLoading: boolean, highlight?: boolean }) {
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
