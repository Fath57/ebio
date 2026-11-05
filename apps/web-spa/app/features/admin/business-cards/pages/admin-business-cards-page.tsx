import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { AdminSupplierListItem } from '@/features/admin/suppliers/utils/suppliers-queries'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Checkbox } from '@boilerstone/ui/components/primitives/checkbox'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ImageOff, Loader2, Printer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { StatusBadge } from '@/features/admin/common/components/status-badge'
import { useListParams } from '@/features/admin/common/utils/use-list-params'
import { fetchAdminSuppliersQueryOptions } from '@/features/admin/suppliers/utils/suppliers-queries'
import { BusinessCardDownloadButton } from '../components/business-card-download-button'
import { batchFilename, downloadBusinessCards } from '../utils/business-cards-queries'

const PAGE_SIZE = 20

export default function AdminBusinessCardsPage() {
  const { t } = useTranslation()
  const list = useListParams({ defaultSort: 'createdAt' })
  // Ticks survive paging: a batch is often picked across several pages.
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [busyBatch, setBusyBatch] = useState<'selection' | 'all' | null>(null)

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    ...fetchAdminSuppliersQueryOptions({
      // Only a validated shop has a public page for its QR code to open.
      status: 'VALIDATED',
      q: list.q || undefined,
      sortBy: list.sortBy,
      sortDir: list.sortDir,
      page: list.page,
    }),
    placeholderData: keepPreviousData,
  })

  const items = useMemo(() => data?.items ?? [], [data?.items])
  const total = data?.total ?? 0
  const allOnPage = items.length > 0 && items.every(item => selected.has(item.id))
  const someOnPage = items.some(item => selected.has(item.id))

  const toggle = (ids: string[], checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current)
      for (const id of ids) {
        if (checked)
          next.add(id)
        else
          next.delete(id)
      }
      return next
    })
  }

  const generate = async (kind: 'selection' | 'all') => {
    setBusyBatch(kind)
    try {
      await downloadBusinessCards(kind === 'all' ? { all: true } : { supplierIds: [...selected] }, batchFilename())
    }
    catch {
      toast.error(t('admin.businessCards.failed'))
    }
    finally {
      setBusyBatch(null)
    }
  }

  const columns = useMemo<Array<ColumnDef<AdminSupplierListItem, unknown>>>(() => [
    {
      id: 'select',
      enableSorting: false,
      header: () => (
        <Checkbox
          aria-label={t('admin.businessCards.selectPage')}
          checked={allOnPage ? true : someOnPage ? 'indeterminate' : false}
          onCheckedChange={value => toggle(items.map(item => item.id), value === true)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={t('admin.businessCards.selectShop', { shop: row.original.shopName })}
          checked={selected.has(row.original.id)}
          onCheckedChange={value => toggle([row.original.id], value === true)}
        />
      ),
    },
    {
      id: 'shopName',
      header: t('admin.businessCards.columns.shop'),
      meta: { wrap: true },
      cell: ({ row }) => (
        <span className="flex items-center gap-3">
          {row.original.profilePhoto
            ? <img src={row.original.profilePhoto} alt="" className="h-10 w-10 shrink-0 rounded-md border bg-white object-contain" />
            : (
                <span className="bg-muted text-muted-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-md border">
                  <ImageOff className="h-4 w-4" />
                </span>
              )}
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">{row.original.shopName}</span>
            <span className="text-muted-foreground text-xs">{row.original.cardPlace || t('admin.businessCards.noPlace')}</span>
          </span>
        </span>
      ),
    },
    {
      id: 'logo',
      header: t('admin.businessCards.columns.logo'),
      enableSorting: false,
      // The card still prints without a logo, with initials: worth seeing before ordering paper.
      cell: ({ row }) => (row.original.cardHasLogo
        ? <StatusBadge tone="done">{t('admin.businessCards.withLogo')}</StatusBadge>
        : <StatusBadge tone="problem">{t('admin.businessCards.withoutLogo')}</StatusBadge>),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <BusinessCardDownloadButton supplierId={row.original.id} shopName={row.original.shopName} />
        </div>
      ),
    },
  ], [t, items, selected, allOnPage, someOnPage])

  return (
    <AdminListShell
      title={t('admin.businessCards.title')}
      description={t('admin.businessCards.description')}
      actions={(
        <div className="flex flex-wrap gap-2">
          {selected.size > 0 && (
            <Button variant="ghost" className="h-10" onClick={() => setSelected(new Set())}>
              {t('admin.businessCards.clearSelection')}
            </Button>
          )}
          <Button variant="outline" className="h-10 gap-2" disabled={selected.size === 0 || busyBatch !== null} onClick={() => generate('selection')}>
            {busyBatch === 'selection' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            {t('admin.businessCards.generateSelection', { count: selected.size })}
          </Button>
          <Button className="h-10 gap-2" disabled={total === 0 || busyBatch !== null} onClick={() => generate('all')}>
            {busyBatch === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            {t('admin.businessCards.generateAll')}
          </Button>
        </div>
      )}
      searchValue={list.q}
      onSearchChange={list.setSearch}
      searchPlaceholder={t('admin.businessCards.searchPlaceholder')}
      onResetFilters={list.reset}
      columns={columns}
      data={items}
      total={total}
      page={list.page}
      pageSize={PAGE_SIZE}
      onPageChange={list.setPage}
      sorting={list.sorting}
      onSortingChange={list.setSorting}
      isLoading={isLoading}
      isFetching={isFetching}
      isError={isError}
      onRetry={() => refetch()}
      emptyLabel={t('admin.businessCards.empty')}
    />
  )
}
