import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { AdminProductItem, ProductStatusFilter, StockFilter } from '../utils/products-queries'
import type { PickerOption } from '@/features/admin/common/components/entity-picker'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { useQuery } from '@tanstack/react-query'
import { ImageOff, Pencil, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { fetchCategoriesQueryOptions } from '@/features/admin/categories/utils/categories-queries'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { EntityPicker } from '@/features/admin/common/components/entity-picker'
import { searchSuppliers } from '@/features/admin/common/utils/target-search'
import { useServerSorting } from '@/features/admin/common/utils/use-server-sorting'
import { Can } from '@/lib/casl/can'
import {
  ADMIN_PRODUCTS_PAGE_SIZE,
  fetchAdminProductsQueryOptions,
  PRODUCT_STATUS_OPTIONS,
  STOCK_OPTIONS,
} from '../utils/products-queries'

const SELECT_CLASS = 'border-input bg-background h-9 rounded-md border px-3 text-sm'

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
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState<ProductStatusFilter>('')
  const [stock, setStock] = useState<StockFilter>('')
  const [promo, setPromo] = useState(false)
  const [shop, setShop] = useState<PickerOption | null>(null)
  const [page, setPage] = useState(1)

  const resetPage = useCallback(() => setPage(1), [])
  const { sorting, setSorting, sortBy, sortDir } = useServerSorting('created', resetPage)

  const { data: categories } = useQuery(fetchCategoriesQueryOptions())

  const { data, isLoading } = useQuery(
    fetchAdminProductsQueryOptions({
      q: search || undefined,
      supplierId: shop?.id,
      categoryId: categoryId || undefined,
      status,
      stock,
      promo,
      sortBy,
      sortDir,
      page,
    }),
  )

  const handleShop = useCallback((option: PickerOption) => {
    setShop(option)
    setPage(1)
  }, [])

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
          onClick={event => event.stopPropagation()}
        >
          {row.original.supplierName}
        </Link>
      ),
    },
    {
      id: 'price',
      header: t('admin.products.columns.price'),
      cell: ({ row }) => {
        const discounted = row.original.promotionalPrice
        const hasDiscount = discounted !== null && discounted < row.original.pricePerUnit
        return (
          <span className="flex flex-col items-end font-mono">
            <span className={hasDiscount ? 'text-ebio-coral-600' : ''}>
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
      cell: ({ row }) => {
        const { stock: value, stockAlertThreshold } = row.original
        const tone = value === 0
          ? 'text-destructive font-bold'
          : value <= stockAlertThreshold ? 'font-bold text-amber-500' : ''
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
            <Badge className="bg-ebio-green-600">{t('catalog.status.active')}</Badge>
          )}
          {row.original.status === 'OUT_OF_STOCK' && (
            <Badge variant="destructive">{t('catalog.status.outOfStock')}</Badge>
          )}
          {row.original.status === 'HIDDEN' && (
            <Badge variant="secondary">{t('catalog.status.hidden')}</Badge>
          )}
          {row.original.hasPromotion && (
            <Badge variant="outline" className="text-ebio-coral-600">
              {t('catalog.promo')}
            </Badge>
          )}
          {/* A shop that is not validated shows nothing to buyers, whatever
              the product's own status says. */}
          {row.original.supplierValidationStatus !== 'VALIDATED' && (
            <Badge variant="outline">{t('admin.products.shopNotValidated')}</Badge>
          )}
        </span>
      ),
    },
    {
      id: 'created',
      header: t('admin.products.columns.created'),
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
            onClick={(event) => {
              event.stopPropagation()
              navigate(`/catalogue/${row.original.id}/modifier?boutique=${row.original.supplierId}`)
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </Can>
      ),
    },
  ], [t, i18n.language, navigate])

  return (
    <AdminListShell
      title={t('admin.products.title')}
      description={t('admin.products.description')}
      searchValue={search}
      onSearchChange={(value) => {
        setSearch(value)
        setPage(1)
      }}
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
          {shop && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={t('admin.products.clearShop')}
              onClick={() => {
                setShop(null)
                setPage(1)
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}

          <select
            className={SELECT_CLASS}
            value={categoryId}
            aria-label={t('admin.products.columns.category')}
            onChange={(event) => {
              setCategoryId(event.target.value)
              setPage(1)
            }}
          >
            <option value="">{t('admin.products.allCategories')}</option>
            {(categories?.categories ?? []).map(category => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          <select
            className={SELECT_CLASS}
            value={status}
            aria-label={t('admin.products.columns.status')}
            onChange={(event) => {
              setStatus(event.target.value as ProductStatusFilter)
              setPage(1)
            }}
          >
            <option value="">{t('admin.products.allStatuses')}</option>
            {PRODUCT_STATUS_OPTIONS.map(option => (
              <option key={option} value={option}>
                {t(`admin.products.status.${option}`)}
              </option>
            ))}
          </select>

          <select
            className={SELECT_CLASS}
            value={stock}
            aria-label={t('admin.products.columns.stock')}
            onChange={(event) => {
              setStock(event.target.value as StockFilter)
              setPage(1)
            }}
          >
            <option value="">{t('admin.products.allStock')}</option>
            {STOCK_OPTIONS.map(option => (
              <option key={option} value={option}>
                {t(`admin.products.stock.${option}`)}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary h-4 w-4"
              checked={promo}
              onChange={(event) => {
                setPromo(event.target.checked)
                setPage(1)
              }}
            />
            {t('admin.products.onlyPromotions')}
          </label>
        </>
      )}
      columns={columns}
      data={data?.items ?? []}
      total={data?.total ?? 0}
      page={page}
      pageSize={ADMIN_PRODUCTS_PAGE_SIZE}
      onPageChange={setPage}
      sorting={sorting}
      onSortingChange={setSorting}
      onRowClick={product => navigate(`/catalogue/${product.id}?boutique=${product.supplierId}`)}
      isLoading={isLoading}
      emptyLabel={t('admin.products.empty')}
    />
  )
}
