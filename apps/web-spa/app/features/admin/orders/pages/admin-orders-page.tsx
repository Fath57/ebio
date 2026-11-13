import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { OrderAdvancedFilterKey } from '../utils/order-status'
import type { AdminOrderListItem, AdminOrdersFilters } from '../utils/orders-queries'
import type { ActiveFilter } from '@/features/admin/common/components/admin-list-shell'
import type { AdvancedFilterField } from '@/features/admin/common/components/advanced-filters'
import type { PickerOption } from '@/features/admin/common/components/entity-picker'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { advancedFilterChips, AdvancedFilters } from '@/features/admin/common/components/advanced-filters'
import { EntityPicker } from '@/features/admin/common/components/entity-picker'
import { ExportCsvButton } from '@/features/admin/common/components/export-csv-button'
import { FilterSelect } from '@/features/admin/common/components/filter-select'
import { StatusBadge } from '@/features/admin/common/components/status-badge'
import { searchSuppliers } from '@/features/admin/common/utils/target-search'
import { useListParams } from '@/features/admin/common/utils/use-list-params'
import { ORDER_ADVANCED_FILTER_KEYS, ORDER_STATUS_OPTIONS, ORDER_STATUS_TONES, PAYMENT_METHODS, PICKUP_MODES } from '../utils/order-status'
import { adminOrdersExportPath, fetchAdminOrdersQueryOptions } from '../utils/orders-queries'

const PAGE_SIZE = 20

/** `?proche=` values: orders sent to a relative, or ordinary ones only. */
const GIFT_FILTERS = ['true', 'false']

function formatAmount(value: number): string {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

export default function AdminOrdersPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const list = useListParams({
    defaultSort: 'createdAt',
    filters: ['statut', 'boutique', 'boutiqueNom', 'paiement', 'mode', 'proche', ...ORDER_ADVANCED_FILTER_KEYS],
  })
  const { statut: status, boutique, boutiqueNom } = list.values
  const paymentMethod = PAYMENT_METHODS.includes(list.values.paiement) ? list.values.paiement : ''
  const pickupMode = PICKUP_MODES.includes(list.values.mode) ? list.values.mode : ''
  const gift = GIFT_FILTERS.includes(list.values.proche) ? list.values.proche : ''
  const advanced = Object.fromEntries(ORDER_ADVANCED_FILTER_KEYS.map(key => [key, list.values[key]])) as Record<OrderAdvancedFilterKey, string>
  // Only the id narrows the query; the name rides along so the picker and the chip read well after a reload.
  const shop: PickerOption | null = boutique ? { id: boutique, label: boutiqueNom || boutique } : null

  // One object for the list and the export, so the file always matches the screen.
  const filters: AdminOrdersFilters = {
    q: list.q || undefined,
    status: status || undefined,
    supplierId: boutique || undefined,
    paymentMethod: paymentMethod || undefined,
    pickupMode: pickupMode || undefined,
    from: advanced.du || undefined,
    to: advanced.au || undefined,
    minAmount: advanced.montantMin || undefined,
    maxAmount: advanced.montantMax || undefined,
    promo: advanced.promo || undefined,
    sponsor: advanced.offerte || undefined,
    courier: advanced.livreur || undefined,
    gift: gift || undefined,
    sortBy: list.sortBy,
    sortDir: list.sortDir,
  }

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    ...fetchAdminOrdersQueryOptions({ ...filters, page: list.page }),
    placeholderData: keepPreviousData,
  })

  const { setFilters } = list
  const handleShop = useCallback((option: PickerOption) => {
    setFilters({ boutique: option.id, boutiqueNom: option.label })
  }, [setFilters])

  const columns = useMemo<Array<ColumnDef<AdminOrderListItem, unknown>>>(() => [
    {
      id: 'orderNumber',
      header: t('admin.orders.columns.number'),
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-medium">{row.original.orderNumber}</span>
          {row.original.isGift && (
            <StatusBadge tone="action">
              {t('admin.orders.gift.badge')}
            </StatusBadge>
          )}
        </span>
      ),
    },
    {
      id: 'createdAt',
      header: t('admin.orders.columns.date'),
      meta: { hideBelow: 'sm' },
      cell: ({ row }) => {
        const date = new Date(row.original.createdAt)
        return (
          <span className="flex flex-col">
            <span>{date.toLocaleDateString(i18n.language)}</span>
            <span className="text-muted-foreground text-xs">
              {date.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
            </span>
          </span>
        )
      },
    },
    {
      id: 'buyer',
      header: t('admin.orders.columns.buyer'),
      meta: { wrap: true },
      cell: ({ row }) => row.original.buyer.name,
    },
    {
      id: 'supplier',
      header: t('admin.orders.columns.supplier'),
      meta: { wrap: true, hideBelow: 'lg' },
      cell: ({ row }) => row.original.supplier.shopName,
    },
    {
      id: 'status',
      header: t('admin.orders.columns.status'),
      cell: ({ row }) => (
        <StatusBadge tone={ORDER_STATUS_TONES[row.original.status] ?? 'idle'}>
          {t(`admin.orders.status.${row.original.status}`)}
        </StatusBadge>
      ),
    },
    {
      id: 'paymentMethod',
      header: t('admin.orders.columns.payment'),
      enableSorting: false,
      meta: { hideBelow: 'lg' },
      cell: ({ row }) => {
        const method = row.original.paymentMethod
        if (!method)
          return <span className="text-muted-foreground">—</span>
        return (
          <Badge variant="outline">
            {PAYMENT_METHODS.includes(method) ? t(`admin.orders.paymentMethods.${method}`) : method}
          </Badge>
        )
      },
    },
    {
      id: 'totalAmount',
      header: t('admin.orders.columns.amount'),
      meta: { numeric: true },
      // The commission rides under the total: one column fewer, and the two are read together anyway.
      cell: ({ row }) => (
        <span className="flex flex-col items-end">
          <span className="font-medium">{formatAmount(row.original.totalAmount)}</span>
          <span className="text-muted-foreground hidden text-xs lg:inline">
            {t('admin.orders.commissionShort', { amount: formatAmount(row.original.commissionAmount) })}
          </span>
        </span>
      ),
    },
  ], [t, i18n.language])

  const advancedFields: AdvancedFilterField[] = [
    { kind: 'date', key: 'du', label: t('admin.orders.filters.from') },
    { kind: 'date', key: 'au', label: t('admin.orders.filters.to') },
    { kind: 'min', key: 'montantMin', label: t('admin.orders.filters.minAmount'), unit: 'FCFA', step: 500 },
    { kind: 'min', key: 'montantMax', label: t('admin.orders.filters.maxAmount'), unit: 'FCFA', step: 500 },
    { kind: 'select', key: 'promo', label: t('admin.orders.filters.promo'), allLabel: t('admin.orders.filters.all'), options: [
      { value: 'with', label: t('admin.orders.filters.promoWith') },
      { value: 'without', label: t('admin.orders.filters.promoWithout') },
    ] },
    { kind: 'select', key: 'offerte', label: t('admin.orders.filters.sponsor'), allLabel: t('admin.orders.filters.all'), options: [
      { value: 'PLATFORM', label: t('admin.orders.filters.sponsorPlatform') },
      { value: 'SUPPLIER', label: t('admin.orders.filters.sponsorSupplier') },
      { value: 'none', label: t('admin.orders.filters.sponsorNone') },
    ] },
    { kind: 'select', key: 'livreur', label: t('admin.orders.filters.courier'), allLabel: t('admin.orders.filters.all'), options: [
      { value: 'assigned', label: t('admin.orders.filters.courierAssigned') },
      { value: 'unassigned', label: t('admin.orders.filters.courierUnassigned') },
    ] },
  ]

  const activeFilters: ActiveFilter[] = []
  if (shop) {
    activeFilters.push({
      key: 'boutique',
      group: t('admin.orders.columns.supplier'),
      value: shop.label,
      onRemove: () => list.setFilters({ boutique: '', boutiqueNom: '' }),
    })
  }
  if (paymentMethod) {
    activeFilters.push({
      key: 'paiement',
      group: t('admin.orders.columns.payment'),
      value: t(`admin.orders.paymentMethods.${paymentMethod}`),
      onRemove: () => list.setFilter('paiement', ''),
    })
  }
  if (pickupMode) {
    activeFilters.push({
      key: 'mode',
      group: t('admin.orders.filters.mode'),
      value: t(`admin.orders.pickupModes.${pickupMode}`),
      onRemove: () => list.setFilter('mode', ''),
    })
  }
  if (gift) {
    activeFilters.push({
      key: 'proche',
      group: t('admin.orders.gift.filter'),
      value: t(`admin.orders.gift.filter_${gift}`),
      onRemove: () => list.setFilter('proche', ''),
    })
  }
  activeFilters.push(...advancedFilterChips(advancedFields, advanced, key => list.setFilter(key as OrderAdvancedFilterKey, ''), i18n.language))

  return (
    <AdminListShell
      title={t('admin.orders.title')}
      description={t('admin.orders.description')}
      actions={<ExportCsvButton path={adminOrdersExportPath(filters)} filename="commandes" />}
      searchValue={list.q}
      onSearchChange={list.setSearch}
      searchPlaceholder={t('admin.orders.searchPlaceholder')}
      statusTabs={{
        tabs: ORDER_STATUS_OPTIONS.map(value => ({
          value,
          label: t(`admin.orders.status.${value}`),
          tone: ORDER_STATUS_TONES[value],
        })),
        value: status,
        onChange: value => list.setFilter('statut', value),
        counts: data?.statusCounts,
      }}
      filters={(
        <>
          <div className="w-56">
            <EntityPicker
              value={shop?.id ?? ''}
              placeholder={t('admin.orders.filters.allShops')}
              searchPlaceholder={t('catalog.scope.pickerSearch')}
              emptyLabel={t('catalog.scope.pickerEmpty')}
              onSearch={searchSuppliers}
              onSelect={handleShop}
              selected={shop}
            />
          </div>

          <FilterSelect
            value={paymentMethod}
            onValueChange={value => list.setFilter('paiement', value)}
            allLabel={t('admin.orders.filters.allPayments')}
            ariaLabel={t('admin.orders.columns.payment')}
            options={PAYMENT_METHODS.map(method => ({ value: method, label: t(`admin.orders.paymentMethods.${method}`) }))}
          />

          <FilterSelect
            value={pickupMode}
            onValueChange={value => list.setFilter('mode', value)}
            allLabel={t('admin.orders.filters.allModes')}
            ariaLabel={t('admin.orders.filters.mode')}
            options={PICKUP_MODES.map(mode => ({ value: mode, label: t(`admin.orders.pickupModes.${mode}`) }))}
          />

          <FilterSelect
            value={gift}
            onValueChange={value => list.setFilter('proche', value)}
            allLabel={t('admin.orders.gift.filterAll')}
            ariaLabel={t('admin.orders.gift.filter')}
            options={GIFT_FILTERS.map(value => ({ value, label: t(`admin.orders.gift.filter_${value}`) }))}
          />

          <AdvancedFilters fields={advancedFields} values={advanced} onChange={(key, value) => list.setFilter(key as OrderAdvancedFilterKey, value)} />
        </>
      )}
      activeFilters={activeFilters}
      onResetFilters={list.reset}
      columns={columns}
      data={data?.items ?? []}
      total={data?.total ?? 0}
      page={list.page}
      pageSize={PAGE_SIZE}
      onPageChange={list.setPage}
      sorting={list.sorting}
      onSortingChange={list.setSorting}
      onRowClick={order => navigate(`/admin/commandes/${order.id}`)}
      isLoading={isLoading}
      isFetching={isFetching}
      isError={isError}
      onRetry={() => refetch()}
      emptyLabel={t('admin.orders.empty')}
    />
  )
}
