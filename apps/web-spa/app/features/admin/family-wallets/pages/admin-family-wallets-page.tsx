import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { AdminFamilyWalletRow, FamilyWalletStatus } from '../utils/family-wallets-queries'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { useListParams } from '@/features/admin/common/utils/use-list-params'
import { formatAmount } from '@/features/admin/wallets/utils/format-amount'
import { FamilyWalletStatusBadge } from '../components/family-status-badge'
import { FAMILY_WALLETS_PAGE_SIZE, fetchFamilyWalletsQueryOptions } from '../utils/family-wallets-queries'

const STATUSES: FamilyWalletStatus[] = ['ACTIVE', 'SUSPENDED', 'CLOSED']

function isStatus(value: string): value is FamilyWalletStatus {
  return (STATUSES as string[]).includes(value)
}

/**
 * Every family wallet: who pays, how many relatives spend from it, what is
 * left. A row opens the wallet with its members and its ledger.
 */
export default function AdminFamilyWalletsPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const list = useListParams({ defaultSort: 'createdAt', filters: ['statut'] })
  const status = isStatus(list.values.statut) ? list.values.statut : undefined

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    ...fetchFamilyWalletsQueryOptions({ status, search: list.q || undefined, page: list.page }),
    placeholderData: keepPreviousData,
  })

  const columns = useMemo<Array<ColumnDef<AdminFamilyWalletRow, unknown>>>(() => [
    {
      id: 'payer',
      header: t('admin.familyWallets.columns.payer'),
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.payer.name}</p>
          <p className="text-muted-foreground truncate text-xs">{row.original.payer.phone ?? row.original.payer.email}</p>
        </div>
      ),
    },
    {
      id: 'members',
      header: t('admin.familyWallets.columns.members'),
      meta: { numeric: true },
      cell: ({ row }) => t('admin.familyWallets.memberCount', { count: row.original.memberCount }),
    },
    {
      id: 'balance',
      header: t('admin.familyWallets.columns.balance'),
      meta: { numeric: true },
      cell: ({ row }) => <span className="font-mono font-medium">{formatAmount(row.original.balance)}</span>,
    },
    {
      id: 'status',
      header: t('admin.familyWallets.columns.status'),
      cell: ({ row }) => <FamilyWalletStatusBadge status={row.original.status} suspendedByAdmin={row.original.suspendedByAdmin} />,
    },
    {
      id: 'createdAt',
      header: t('admin.familyWallets.columns.createdAt'),
      meta: { hideBelow: 'md' },
      cell: ({ row }) => (
        <span className="text-muted-foreground">{new Date(row.original.createdAt).toLocaleDateString(i18n.language)}</span>
      ),
    },
  ], [t, i18n.language])

  return (
    <AdminListShell
      title={t('admin.familyWallets.title')}
      description={t('admin.familyWallets.description')}
      statusTabs={{
        tabs: STATUSES.map(value => ({
          value,
          label: t(`admin.familyWallets.status.${value}`),
          tone: value === 'SUSPENDED' ? 'action' : undefined,
        })),
        value: list.values.statut,
        onChange: value => list.setFilter('statut', value),
      }}
      searchValue={list.q}
      onSearchChange={list.setSearch}
      searchPlaceholder={t('admin.familyWallets.search')}
      onResetFilters={list.reset}
      columns={columns}
      data={data?.items ?? []}
      total={data?.total ?? 0}
      page={list.page}
      pageSize={FAMILY_WALLETS_PAGE_SIZE}
      onPageChange={list.setPage}
      onRowClick={wallet => navigate(`/admin/portefeuilles-famille/${wallet.id}`)}
      isLoading={isLoading}
      isFetching={isFetching}
      isError={isError}
      onRetry={() => refetch()}
      emptyLabel={t('admin.familyWallets.empty')}
    />
  )
}
