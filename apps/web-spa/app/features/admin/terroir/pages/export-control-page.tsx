import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { AdminExportProduct, ExportProfileStatus } from '../utils/terroir-types'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { ProductThumb } from '@/features/admin/common/components/product-thumb'
import { ExportProductSheet } from '../components/export-product-sheet'
import { ExportStatusBadge } from '../components/terroir-status-badges'
import { WithdrawDialog } from '../forms/withdraw-dialog'
import { formatDateTime } from '../utils/terroir-format'
import { exportProductsQueryOptions, reinstateProduct, terroirKeys, withdrawProduct } from '../utils/terroir-queries'
import { EXPORT_PROFILE_STATUSES } from '../utils/terroir-types'

const SETTINGS_PATH = '/admin/parametres#terroir-etranger'

function isStatus(value: string): value is ExportProfileStatus {
  return (EXPORT_PROFILE_STATUSES as readonly string[]).includes(value)
}

function MissingCriteria({ product }: { product: AdminExportProduct }) {
  const { t } = useTranslation()
  const missing = product.criteria.filter(criterion => !criterion.met)
  if (missing.length === 0)
    return <span className="text-muted-foreground text-sm">{t('admin.terroir.control.allMet')}</span>
  const labels = missing.map(criterion => criterion.label).join(', ')
  return (
    <div className="min-w-0" title={labels}>
      <p className="text-ebio-earth-800 dark:text-ebio-earth-100 text-sm font-medium">
        {t('admin.terroir.control.missing', { count: missing.length })}
      </p>
      <p className="text-muted-foreground line-clamp-2 text-xs">{labels}</p>
    </div>
  )
}

/**
 * The export watch. A product becomes exportable by itself once it meets
 * every criterion (set in Réglages, Valise du pays); nobody validates by
 * hand. eBio can still withdraw any product, with a reason the shop
 * receives, and reinstate it later.
 */
export default function ExportControlPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [statusTab, setStatusTab] = useState<string>('EXPORTABLE')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<AdminExportProduct | null>(null)
  const [withdrawing, setWithdrawing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const status = isStatus(statusTab) ? statusTab : 'EXPORTABLE'
  const products = useQuery(exportProductsQueryOptions({ status, search, page }))

  const changeStatus = (value: string) => {
    setStatusTab(value)
    setPage(1)
  }

  const changeSearch = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  const closeSheet = () => {
    setSelected(null)
    setWithdrawing(false)
    setError(null)
  }

  const onDone = (saved: AdminExportProduct, message: string) => {
    queryClient.invalidateQueries({ queryKey: terroirKeys.productsRoot })
    queryClient.invalidateQueries({ queryKey: terroirKeys.packsRoot })
    setSelected(saved)
    setWithdrawing(false)
    toast.success(message)
  }

  const withdrawMutation = useMutation({
    mutationFn: ({ productId, reason }: { productId: string, reason: string }) => withdrawProduct(productId, reason),
    onMutate: () => setError(null),
    onSuccess: saved => onDone(saved, t('admin.terroir.control.withdrawn')),
    onError: (failure: Error) => setError(failure.message || t('admin.terroir.genericError')),
  })

  const reinstateMutation = useMutation({
    mutationFn: (productId: string) => reinstateProduct(productId),
    onSuccess: saved => onDone(saved, t('admin.terroir.control.reinstated')),
    onError: (failure: Error) => toast.error(failure.message || t('admin.terroir.genericError')),
  })

  const columns = useMemo<Array<ColumnDef<AdminExportProduct, unknown>>>(() => [
    {
      id: 'product',
      header: t('admin.terroir.control.columns.product'),
      meta: { wrap: true },
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <ProductThumb url={row.original.imageUrl} size={48} />
          <div className="min-w-0">
            <p className="font-medium">{row.original.productName}</p>
            <p className="text-muted-foreground text-xs md:hidden">{row.original.shopName}</p>
          </div>
        </div>
      ),
    },
    {
      id: 'shop',
      header: t('admin.terroir.control.columns.shop'),
      meta: { hideBelow: 'md', wrap: true },
      cell: ({ row }) => row.original.shopName,
    },
    {
      id: 'category',
      header: t('admin.terroir.control.columns.category'),
      meta: { hideBelow: 'lg', wrap: true },
      cell: ({ row }) => row.original.categoryName,
    },
    {
      id: 'status',
      header: t('admin.terroir.control.columns.status'),
      cell: ({ row }) => <ExportStatusBadge status={row.original.status} />,
    },
    {
      id: 'criteria',
      header: t('admin.terroir.control.columns.criteria'),
      meta: { hideBelow: 'sm', wrap: true, className: 'max-w-72' },
      cell: ({ row }) => <MissingCriteria product={row.original} />,
    },
    {
      id: 'updatedAt',
      header: t('admin.terroir.control.columns.updatedAt'),
      meta: { hideBelow: 'lg' },
      cell: ({ row }) => <span className="text-muted-foreground text-sm">{formatDateTime(row.original.updatedAt)}</span>,
    },
  ], [t])

  const data = products.data

  return (
    <>
      <AdminListShell
        title={t('admin.terroir.control.title')}
        description={t('admin.terroir.control.description')}
        summary={(
          <div
            role="note"
            className="border-ebio-blue-100 bg-ebio-blue-50 text-ebio-blue-800 dark:border-ebio-blue-800 dark:bg-ebio-blue-900 dark:text-ebio-blue-100 flex gap-3 rounded-md border p-3 text-sm"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              <Trans
                i18nKey="admin.terroir.control.explanation"
                components={{ settings: <Link to={SETTINGS_PATH} className="font-medium underline underline-offset-2" /> }}
              />
            </p>
          </div>
        )}
        statusTabs={{
          tabs: EXPORT_PROFILE_STATUSES.map(value => ({
            value,
            label: t(`admin.terroir.control.tabs.${value}`),
            tone: value === 'WITHDRAWN' ? 'problem' : undefined,
          })),
          value: status,
          onChange: changeStatus,
          counts: data?.counts,
        }}
        searchValue={search}
        onSearchChange={changeSearch}
        searchPlaceholder={t('admin.terroir.control.searchPlaceholder')}
        onResetFilters={() => changeSearch('')}
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={page}
        pageSize={data?.pageSize ?? 20}
        onPageChange={setPage}
        onRowClick={(product) => {
          setError(null)
          setSelected(product)
        }}
        isLoading={products.isLoading}
        isFetching={products.isFetching}
        isError={products.isError}
        onRetry={() => products.refetch()}
        emptyLabel={t(`admin.terroir.control.empty.${status}`)}
      />

      {selected && (
        <ExportProductSheet
          key={selected.productId}
          product={selected}
          isPending={withdrawMutation.isPending || reinstateMutation.isPending}
          onWithdraw={() => {
            setError(null)
            setWithdrawing(true)
          }}
          onReinstate={() => reinstateMutation.mutate(selected.productId)}
          onClose={closeSheet}
        />
      )}
      {selected && withdrawing && (
        <WithdrawDialog
          title={t('admin.terroir.control.withdrawTitle', { name: selected.productName })}
          description={t('admin.terroir.control.withdrawDescription', { shop: selected.shopName })}
          isPending={withdrawMutation.isPending}
          error={error}
          onClose={() => setWithdrawing(false)}
          onSubmit={reason => withdrawMutation.mutate({ productId: selected.productId, reason })}
        />
      )}
    </>
  )
}
