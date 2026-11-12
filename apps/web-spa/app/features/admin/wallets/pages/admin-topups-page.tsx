import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { useListParams } from '@/features/admin/common/utils/use-list-params'
import { TOPUP_STATUSES, TOPUP_TONES, useTopupColumns } from '../components/topup-columns'
import { fetchAdminTopupsQueryOptions } from '../utils/wallets-queries'

/**
 * Money coming in: every wallet topup paid online, by buyers, shops and
 * couriers alike. Searchable by the payer; each row opens the wallet it credited.
 */
export default function AdminTopupsPage() {
  const { t } = useTranslation()
  const list = useListParams({ defaultSort: 'createdAt', filters: ['statut'] })
  const status = list.values.statut
  const columns = useTopupColumns({ withWalletLink: true })
  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    ...fetchAdminTopupsQueryOptions({ status: status || undefined, q: list.q || undefined, page: list.page }),
    placeholderData: keepPreviousData,
  })

  return (
    <AdminListShell
      title={t('admin.wallets.topups.title')}
      description={t('admin.wallets.topups.description')}
      statusTabs={{
        tabs: TOPUP_STATUSES.map(value => ({ value, label: t(`admin.wallets.topupStatus.${value}`), tone: TOPUP_TONES[value] })),
        value: status,
        onChange: value => list.setFilter('statut', value),
        counts: data?.statusCounts,
      }}
      searchValue={list.q}
      onSearchChange={list.setSearch}
      searchPlaceholder={t('admin.wallets.topups.search')}
      onResetFilters={list.reset}
      columns={columns}
      data={data?.items ?? []}
      total={data?.total ?? 0}
      page={list.page}
      pageSize={data?.limit ?? 20}
      onPageChange={list.setPage}
      isLoading={isLoading}
      isFetching={isFetching}
      isError={isError}
      onRetry={() => refetch()}
      emptyLabel={t(list.isFiltered ? 'admin.wallets.topups.emptyFiltered' : 'admin.wallets.topups.empty')}
    />
  )
}
