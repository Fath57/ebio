import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { AdminProductItem, ProductAdvancedFilterKey, ProductStatusFilter, StockFilter } from '../utils/products-queries'
import type { ActiveFilter } from '@/features/admin/common/components/admin-list-shell'
import type { AdvancedFilterField } from '@/features/admin/common/components/advanced-filters'
import type { PickerOption } from '@/features/admin/common/components/entity-picker'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ImageOff, Pencil } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { fetchCategoriesQueryOptions } from '@/features/admin/categories/utils/categories-queries'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { advancedFilterChips, AdvancedFilters } from '@/features/admin/common/components/advanced-filters'
import { EntityPicker } from '@/features/admin/common/components/entity-picker'
import { FilterSelect } from '@/features/admin/common/components/filter-select'
import { StatusBadge } from '@/features/admin/common/components/status-badge'
import { searchSuppliers } from '@/features/admin/common/utils/target-search'
import { useListParams } from '@/features/admin/common/utils/use-list-params'
import { useCertifications } from '@/features/catalog/utils/use-certifications'
import { Can } from '@/lib/casl/can'
import {
  ADMIN_PRODUCTS_PAGE_SIZE,
  fetchAdminProductsQueryOptions,
  PRODUCT_ADVANCED_FILTER_KEYS,
  PRODUCT_STATUS_OPTIONS,
  STOCK_OPTIONS,
} from '../utils/products-queries'

function formatAmount(value: number): string {
  return value.toLocaleString('fr-FR')
}

/**
 * A product is never listed without its picture.
 *
 * A dead URL counts as a missing picture: without this, the browser's broken
 * image glyph takes the slot and every row below it sits a few pixels off.
 */
function ProductThumbnail({ product }: { product: AdminProductItem }) {
  const [broken, setBroken] = useState(false)

  if (!product.photo || broken) {
    return (
      <span className="bg-muted text-muted-foreground flex h-11 w-11 items-center justify-center rounded-lg">
        <ImageOff className="h-4 w-4" />
      </span>
    )
  }
  return (
    <img
      src={product.photo}
      alt={product.name}
      className="h-11 w-11 rounded-lg object-cover"
      onError={() => setBroken(true)}
    />
  )
}

/**
 * Every product of every shop, in one place.
 *
 * The rows lead into the product studio with the shop already selected, so
 * finding a product and fixing it are the same movement.
 */
export default function AdminProductsPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const list = useListParams({
    defaultSort: 'created',
    filters: ['boutique', 'boutiqueNom', 'categorie', 'statut', 'stock', 'promo', ...PRODUCT_ADVANCED_FILTER_KEYS],
  })
  const { boutique, boutiqueNom, categorie: categoryId } = list.values
  const status = (PRODUCT_STATUS_OPTIONS as string[]).includes(list.values.statut)
    ? list.values.statut as ProductStatusFilter
    : ''
  const stock = (STOCK_OPTIONS as string[]).includes(list.values.stock)
    ? list.values.stock as StockFilter
    : ''
  const promo = list.values.promo === '1'
  const advanced = Object.fromEntries(PRODUCT_ADVANCED_FILTER_KEYS.map(key => [key, list.values[key]])) as Record<ProductAdvancedFilterKey, string>
  const { items: certifications } = useCertifications()
  // Only the id narrows the query; the name rides along so the picker and the chip read well after a reload.
  const shop: PickerOption | null = boutique ? { id: boutique, label: boutiqueNom || boutique } : null

  const { data: categories } = useQuery(fetchCategoriesQueryOptions())
  const categoryName = categories?.categories.find(category => category.id === categoryId)?.name

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    ...fetchAdminProductsQueryOptions({
      q: list.q || undefined,
      supplierId: boutique || undefined,
      categoryId: categoryId || undefined,
      status,
      stock,
      promo,
      advanced,
      sortBy: list.sortBy,
      sortDir: list.sortDir,
      page: list.page,
    }),
    placeholderData: keepPreviousData,
  })

  const { setFilters } = list
  const handleShop = useCallback((option: PickerOption) => {
    setFilters({ boutique: option.id, boutiqueNom: option.label })
  }, [setFilters])

  const columns = useMemo<Array<ColumnDef<AdminProductItem, unknown>>>(() => [
    {
      id: 'photo',
      header: '',
      enableSorting: false,
      cell: ({ row }) => <ProductThumbnail product={row.original} />,
    },
    {
      id: 'name',
      header: t('admin.products.columns.name'),
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="font-medium">{row.original.name}</span>
          <span className="text-muted-foreground text-xs">{row.original.categoryName}</span>
        </span>
      ),
    },
    {
      id: 'shop',
      header: t('admin.products.columns.shop'),
      cell: ({ row }) => (
        <Link
          className="text-primary underline-offset-4 hover:underline"
          to={`/admin/fournisseurs/${row.original.supplierId}`}
        >
          {row.original.supplierName}
        </Link>
      ),
    },
    {
      id: 'price',
      header: t('admin.products.columns.price'),
      meta: { numeric: true },
      cell: ({ row }) => {
        const discounted = row.original.promotionalPrice
        const hasDiscount = discounted !== null && discounted < row.original.pricePerUnit
        return (
          <span className="flex flex-col items-end font-mono">
            <span className={hasDiscount ? 'text-ebio-earth-600 dark:text-ebio-earth-200' : ''}>
              {formatAmount(hasDiscount ? discounted : row.original.pricePerUnit)}
              {' '}
              FCFA
            </span>
            {hasDiscount && (
              <span className="text-muted-foreground text-xs line-through">
                {formatAmount(row.original.pricePerUnit)}
              </span>
            )}
          </span>
        )
      },
    },
    {
      id: 'stock',
      header: t('admin.products.columns.stock'),
      meta: { numeric: true },
      cell: ({ row }) => {
        const { stock: value, stockAlertThreshold } = row.original
        const tone = value === 0
          ? 'text-destructive font-bold'
          : value <= stockAlertThreshold ? 'text-ebio-earth-600 font-bold' : ''
        return <span className={tone}>{value}</span>
      },
    },
    {
      id: 'status',
      header: t('admin.products.columns.status'),
      enableSorting: false,
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-1">
          {row.original.status === 'ACTIVE' && (
            <StatusBadge tone="done">{t('catalog.status.active')}</StatusBadge>
          )}
          {row.original.status === 'OUT_OF_STOCK' && (
            <StatusBadge tone="problem">{t('catalog.status.outOfStock')}</StatusBadge>
          )}
          {row.original.status === 'HIDDEN' && (
            <StatusBadge tone="idle">{t('catalog.status.hidden')}</StatusBadge>
          )}
          {/* Earth, the brand's badge colour: a promotion is news, not an error. */}
          {row.original.hasPromotion && (
            <Badge variant="outline" className="border-ebio-earth-200 text-ebio-earth-800 dark:border-ebio-earth-800 dark:text-ebio-earth-100 rounded-full">
              {t('catalog.promo')}
            </Badge>
          )}
          {/* A shop that is not validated shows nothing to buyers, whatever
              the product's own status says. */}
          {row.original.supplierValidationStatus !== 'VALIDATED' && (
            <StatusBadge tone="action">{t('admin.products.shopNotValidated')}</StatusBadge>
          )}
        </span>
      ),
    },
    {
      id: 'sold',
      header: t('admin.products.columns.sold'),
      meta: { numeric: true },
      cell: ({ row }) => (
        <span className="flex flex-col items-end">
          <span>{row.original.unitsSold}</span>
          {row.original.ratingAvg !== null && (
            <span className="text-muted-foreground font-sans text-xs">{`★ ${row.original.ratingAvg.toFixed(1)} (${row.original.ratingCount})`}</span>
          )}
        </span>
      ),
    },
    {
      id: 'created',
      header: t('admin.products.columns.created'),
      meta: { hideBelow: 'xl' },
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(i18n.language),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <Can action="manage" subject="Product">
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('admin.products.edit')}
            onClick={() => navigate(`/catalogue/${row.original.id}/modifier?boutique=${row.original.supplierId}`)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </Can>
      ),
    },
  ], [t, i18n.language, navigate])

  const advancedFields: AdvancedFilterField[] = [
    { kind: 'min', key: 'minPrice', label: t('admin.products.filters.minPrice'), unit: 'FCFA', step: 100 },
    { kind: 'min', key: 'maxPrice', label: t('admin.products.filters.maxPrice'), unit: 'FCFA', step: 100 },
    { kind: 'min', key: 'minSold', label: t('admin.products.filters.minSold') },
    { kind: 'select', key: 'sales', label: t('admin.products.filters.sales'), allLabel: t('admin.products.filters.all'), options: [
      { value: 'some', label: t('admin.products.filters.salesSome') },
      { value: 'none', label: t('admin.products.filters.salesNone') },
    ] },
    { kind: 'select', key: 'label', label: t('admin.products.filters.label'), allLabel: t('admin.products.filters.all'), options: certifications.map(item => ({ value: item.code, label: item.name })) },
    { kind: 'select', key: 'formats', label: t('admin.products.filters.formats'), allLabel: t('admin.products.filters.all'), options: [
      { value: 'formats', label: t('admin.products.filters.withFormats') },
      { value: 'packs', label: t('admin.products.filters.withPacks') },
    ] },
    { kind: 'select', key: 'shop', label: t('admin.products.filters.shop'), allLabel: t('admin.products.filters.all'), options: [
      { value: 'validated', label: t('admin.products.filters.shopValidated') },
      { value: 'not_validated', label: t('admin.products.filters.shopNotValidated') },
    ] },
    { kind: 'select', key: 'photo', label: t('admin.products.filters.photo'), allLabel: t('admin.products.filters.all'), options: [
      { value: 'missing', label: t('admin.products.filters.noPhoto') },
    ] },
    { kind: 'min', key: 'minRating', label: t('admin.products.filters.minRating'), step: 0.5 },
    { kind: 'date', key: 'createdFrom', label: t('admin.products.filters.createdFrom') },
    { kind: 'date', key: 'createdTo', label: t('admin.products.filters.createdTo') },
  ]

  const activeFilters: ActiveFilter[] = []
  if (shop) {
    activeFilters.push({
      key: 'boutique',
      group: t('admin.products.columns.shop'),
      value: shop.label,
      onRemove: () => list.setFilters({ boutique: '', boutiqueNom: '' }),
    })
  }
  if (categoryId) {
    activeFilters.push({
      key: 'categorie',
      group: t('admin.products.columns.category'),
      value: categoryName ?? '…',
      onRemove: () => list.setFilter('categorie', ''),
    })
  }
  if (status) {
    activeFilters.push({
      key: 'statut',
      group: t('admin.products.columns.status'),
      value: t(`admin.products.status.${status}`),
      onRemove: () => list.setFilter('statut', ''),
    })
  }
  if (stock) {
    activeFilters.push({
      key: 'stock',
      group: t('admin.products.columns.stock'),
      value: t(`admin.products.stock.${stock}`),
      onRemove: () => list.setFilter('stock', ''),
    })
  }
  if (promo) {
    activeFilters.push({
      key: 'promo',
      group: t('catalog.promo'),
      value: t('admin.products.onlyPromotions'),
      onRemove: () => list.setFilter('promo', ''),
    })
  }

  activeFilters.push(...advancedFilterChips(advancedFields, advanced, key => list.setFilter(key as ProductAdvancedFilterKey, ''), i18n.language))

  return (
    <AdminListShell
      title={t('admin.products.title')}
      description={t('admin.products.description')}
      searchValue={list.q}
      onSearchChange={list.setSearch}
      searchPlaceholder={t('admin.products.searchPlaceholder')}
      filters={(
        <>
          <div className="w-56">
            <EntityPicker
              value={shop?.id ?? ''}
              placeholder={t('admin.products.allShops')}
              searchPlaceholder={t('catalog.scope.pickerSearch')}
              emptyLabel={t('catalog.scope.pickerEmpty')}
              onSearch={searchSuppliers}
              onSelect={handleShop}
              selected={shop}
            />
          </div>

          <FilterSelect
            value={categoryId}
            onValueChange={value => list.setFilter('categorie', value)}
            allLabel={t('admin.products.allCategories')}
            ariaLabel={t('admin.products.columns.category')}
            options={(categories?.categories ?? []).map(category => ({ value: category.id, label: category.name }))}
          />

          <FilterSelect
            value={status}
            onValueChange={value => list.setFilter('statut', value)}
            allLabel={t('admin.products.allStatuses')}
            ariaLabel={t('admin.products.columns.status')}
            options={PRODUCT_STATUS_OPTIONS.map(option => ({ value: option, label: t(`admin.products.status.${option}`) }))}
          />

          <FilterSelect
            value={stock}
            onValueChange={value => list.setFilter('stock', value)}
            allLabel={t('admin.products.allStock')}
            ariaLabel={t('admin.products.columns.stock')}
            options={STOCK_OPTIONS.map(option => ({ value: option, label: t(`admin.products.stock.${option}`) }))}
          />

          <label className="flex h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary h-4 w-4"
              checked={promo}
              onChange={event => list.setFilter('promo', event.target.checked ? '1' : '')}
            />
            {t('admin.products.onlyPromotions')}
          </label>

          <AdvancedFilters fields={advancedFields} values={advanced} onChange={(key, value) => list.setFilter(key as ProductAdvancedFilterKey, value)} />
        </>
      )}
      activeFilters={activeFilters}
      onResetFilters={list.reset}
      columns={columns}
      data={data?.items ?? []}
      total={data?.total ?? 0}
      page={list.page}
      pageSize={ADMIN_PRODUCTS_PAGE_SIZE}
      onPageChange={list.setPage}
      sorting={list.sorting}
      onSortingChange={list.setSorting}
      onRowClick={product => navigate(`/admin/produits/${product.id}`)}
      isLoading={isLoading}
      isFetching={isFetching}
      isError={isError}
      onRetry={() => refetch()}
      emptyLabel={t('admin.products.empty')}
    />
  )
}
