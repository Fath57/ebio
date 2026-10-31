import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { AdminSupplierListItem, SupplierAdvancedFilterKey } from '../utils/suppliers-queries'
import type { AdvancedFilterField } from '@/features/admin/common/components/advanced-filters'
import type { StatusTone } from '@/features/admin/common/components/status-badge'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { advancedFilterChips, AdvancedFilters } from '@/features/admin/common/components/advanced-filters'
import { StatusBadge } from '@/features/admin/common/components/status-badge'
import { useListParams } from '@/features/admin/common/utils/use-list-params'
import { fetchAdminSuppliersQueryOptions, SUPPLIER_ADVANCED_FILTER_KEYS } from '../utils/suppliers-queries'

const PAGE_SIZE = 20

// Review order: waiting, waiting on the shop, then the outcomes.
const STATUS_OPTIONS = ['PENDING', 'COMPLEMENT_REQUESTED', 'VALIDATED', 'SUSPENDED', 'REJECTED']

/** A shop waiting for review is the staff's move; one waiting for documents is the shop's. */
const STATUS_TONES: Record<string, StatusTone> = {
  PENDING: 'action',
  VALIDATED: 'done',
  COMPLEMENT_REQUESTED: 'progress',
  SUSPENDED: 'problem',
  REJECTED: 'idle',
}

function formatAmount(value: number): string {
  return `${value.toLocaleString('fr-FR').replace(/\u202F/g, '\u00A0')}\u00A0FCFA`
}

export default function AdminSuppliersPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const list = useListParams({ defaultSort: 'createdAt', filters: ['statut', ...SUPPLIER_ADVANCED_FILTER_KEYS] })
  const status = list.values.statut
  const advanced = Object.fromEntries(SUPPLIER_ADVANCED_FILTER_KEYS.map(key => [key, list.values[key]])) as Record<SupplierAdvancedFilterKey, string>

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    ...fetchAdminSuppliersQueryOptions({
      q: list.q || undefined,
      status: status || undefined,
      advanced,
      sortBy: list.sortBy,
      sortDir: list.sortDir,
      page: list.page,
    }),
    placeholderData: keepPreviousData,
  })

  const advancedFields = useMemo<AdvancedFilterField[]>(() => {
    const yesNo = (yes: string, no: string) => [{ value: 'yes', label: yes }, { value: 'no', label: no }]
    return [
      { kind: 'min', key: 'minOrders', label: t('admin.suppliers.filters.minOrders') },
      { kind: 'min', key: 'minBalance', label: t('admin.suppliers.filters.minBalance'), unit: 'FCFA', step: 1000 },
      { kind: 'min', key: 'minProducts', label: t('admin.suppliers.filters.minProducts') },
      { kind: 'min', key: 'minRating', label: t('admin.suppliers.filters.minRating'), step: 0.5 },
      { kind: 'min', key: 'inactiveDays', label: t('admin.suppliers.filters.inactiveDays'), unit: t('admin.suppliers.filters.days') },
      { kind: 'select', key: 'type', label: t('admin.suppliers.filters.type'), allLabel: t('admin.suppliers.filters.all'), options: [
        { value: 'INPUTS', label: t('admin.suppliers.filters.types.INPUTS') },
        { value: 'TRANSFORMER', label: t('admin.suppliers.filters.types.TRANSFORMER') },
      ] },
      { kind: 'select', key: 'mode', label: t('admin.suppliers.filters.mode'), allLabel: t('admin.suppliers.filters.all'), options: [
        { value: 'ORDER', label: t('admin.suppliers.filters.modes.ORDER') },
        { value: 'CONTACT', label: t('admin.suppliers.filters.modes.CONTACT') },
      ] },
      { kind: 'select', key: 'located', label: t('admin.suppliers.filters.located'), allLabel: t('admin.suppliers.filters.all'), options: yesNo(t('admin.suppliers.located'), t('admin.suppliers.notLocated')) },
      { kind: 'select', key: 'negotiatedRate', label: t('admin.suppliers.filters.negotiatedRate'), allLabel: t('admin.suppliers.filters.all'), options: yesNo(t('admin.suppliers.filters.negotiated'), t('admin.suppliers.filters.categoryRate')) },
      { kind: 'date', key: 'createdFrom', label: t('admin.suppliers.filters.createdFrom') },
      { kind: 'date', key: 'createdTo', label: t('admin.suppliers.filters.createdTo') },
    ]
  }, [t])

  const columns = useMemo<Array<ColumnDef<AdminSupplierListItem, unknown>>>(() => [
    {
      id: 'shopName',
      header: t('admin.suppliers.columns.shop'),
      meta: { wrap: true },
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="font-medium">{row.original.shopName}</span>
          <span className="text-muted-foreground text-xs">
            {[row.original.owner.name, row.original.neighborhood ?? row.original.address].filter(Boolean).join(' · ') || '—'}
          </span>
        </span>
      ),
    },
    {
      id: 'validationStatus',
      header: t('admin.suppliers.columns.status'),
      cell: ({ row }) => (
        <StatusBadge tone={STATUS_TONES[row.original.validationStatus] ?? 'idle'}>
          {t(`admin.suppliers.status.${row.original.validationStatus}`)}
        </StatusBadge>
      ),
    },
    {
      id: 'productCount',
      header: t('admin.suppliers.columns.products'),
      meta: { numeric: true, hideBelow: 'lg' },
      cell: ({ row }) => row.original.productCount,
    },
    {
      id: 'orderCount',
      header: t('admin.suppliers.columns.orders'),
      meta: { numeric: true },
      cell: ({ row }) => (
        <span className="flex flex-col items-end">
          <span>{row.original.orderCount}</span>
          <span className="text-muted-foreground font-sans text-xs">
            {row.original.lastOrderAt
              ? t('admin.suppliers.lastOrder', { date: new Date(row.original.lastOrderAt).toLocaleDateString(i18n.language) })
              : t('admin.suppliers.noOrder')}
          </span>
        </span>
      ),
    },
    {
      id: 'walletBalance',
      header: t('admin.suppliers.columns.balance'),
      meta: { numeric: true },
      cell: ({ row }) => (
        <span className={row.original.walletBalance < 0 ? 'text-ebio-coral-600' : undefined}>{formatAmount(row.original.walletBalance)}</span>
      ),
    },
    {
      id: 'rating',
      header: t('admin.suppliers.columns.rating'),
      meta: { numeric: true, hideBelow: 'xl' },
      cell: ({ row }) => (row.original.rating !== null ? row.original.rating.toFixed(1) : '—'),
    },
    {
      id: 'located',
      header: t('admin.suppliers.columns.located'),
      enableSorting: false,
      meta: { hideBelow: 'xl' },
      // A shop without coordinates shows on no map, and no buyer finds it nearby.
      cell: ({ row }) => (row.original.latitude !== null
        ? <StatusBadge tone="done">{t('admin.suppliers.located')}</StatusBadge>
        : <StatusBadge tone="problem">{t('admin.suppliers.notLocated')}</StatusBadge>),
    },
  ], [t, i18n.language])

  return (
    <AdminListShell
      title={t('admin.suppliers.title')}
      description={t('admin.suppliers.description')}
      searchValue={list.q}
      onSearchChange={list.setSearch}
      searchPlaceholder={t('admin.suppliers.searchPlaceholder')}
      filters={(
        <AdvancedFilters fields={advancedFields} values={advanced} onChange={(key, value) => list.setFilter(key as SupplierAdvancedFilterKey, value)} />
      )}
      activeFilters={advancedFilterChips(advancedFields, advanced, key => list.setFilter(key as SupplierAdvancedFilterKey, ''), i18n.language)}
      statusTabs={{
        tabs: STATUS_OPTIONS.map(value => ({
          value,
          label: t(`admin.suppliers.status.${value}`),
          tone: STATUS_TONES[value],
        })),
        value: status,
        onChange: value => list.setFilter('statut', value),
        counts: data?.statusCounts,
      }}
      onResetFilters={list.reset}
      columns={columns}
      data={data?.items ?? []}
      total={data?.total ?? 0}
      page={list.page}
      pageSize={PAGE_SIZE}
      onPageChange={list.setPage}
      sorting={list.sorting}
      onSortingChange={list.setSorting}
      onRowClick={supplier => navigate(`/admin/fournisseurs/${supplier.id}`)}
      isLoading={isLoading}
      isFetching={isFetching}
      isError={isError}
      onRetry={() => refetch()}
      emptyLabel={t('admin.suppliers.empty')}
    />
  )
}
