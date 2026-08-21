import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { CommissionOrderRow, CommissionSupplierRow } from '../utils/commissions-queries'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { DataTable } from '@boilerstone/ui/components/primitives/data-table'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { useQuery } from '@tanstack/react-query'
import { Download, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import {
  exportCommissionsCsvUrl,
  fetchCommissionOrdersQueryOptions,
  fetchCommissionsQueryOptions,
} from '../utils/commissions-queries'

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  DELIVERED: 'default',
  CANCELLED: 'destructive',
  DISPUTED: 'destructive',
}

function formatAmount(value: number): string {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

function formatRate(value: number): string {
  return `${(value * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`
}

/** First day of the current month, as an <input type="date"> value. */
function monthStart(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

function KpiCard({ label, value, hint, accent }: {
  label: string
  value: string
  hint: string
  accent?: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold ${accent ? 'text-primary' : ''}`}>{value}</p>
        <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
      </CardContent>
    </Card>
  )
}

export default function AdminCommissionsPage() {
  const { t, i18n } = useTranslation()
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState('')
  const [supplierFilter, setSupplierFilter] = useState<{ id: string, name: string } | null>(null)
  const [suppliersPage, setSuppliersPage] = useState(1)
  const [ordersPage, setOrdersPage] = useState(1)

  const filters = {
    from: from || undefined,
    to: to || undefined,
    supplierId: supplierFilter?.id,
  }

  const { data: summary, isLoading } = useQuery(fetchCommissionsQueryOptions(filters, suppliersPage))
  const { data: orders, isLoading: isLoadingOrders } = useQuery(fetchCommissionOrdersQueryOptions(filters, ordersPage))

  const resetPages = () => {
    setSuppliersPage(1)
    setOrdersPage(1)
  }

  const supplierColumns = useMemo<Array<ColumnDef<CommissionSupplierRow, unknown>>>(() => [
    {
      id: 'shopName',
      header: t('admin.commissions.columns.shop'),
      enableSorting: false,
      cell: ({ row }) => (
        <Link to={`/admin/fournisseurs/${row.original.supplierId}`} className="font-medium hover:underline">
          {row.original.shopName}
        </Link>
      ),
    },
    {
      id: 'negotiatedRate',
      header: t('admin.commissions.columns.negotiatedRate'),
      enableSorting: false,
      cell: ({ row }) => (row.original.negotiatedRate != null
        ? <Badge variant="secondary">{formatRate(row.original.negotiatedRate)}</Badge>
        : <span className="text-muted-foreground">{t('admin.commissions.categoryGrid')}</span>),
    },
    {
      id: 'deliveredOrders',
      header: t('admin.commissions.columns.deliveredOrders'),
      enableSorting: false,
      meta: { align: 'right' },
      cell: ({ row }) => row.original.deliveredOrders,
    },
    {
      id: 'realizedBase',
      header: t('admin.commissions.columns.base'),
      enableSorting: false,
      meta: { align: 'right' },
      cell: ({ row }) => formatAmount(row.original.realizedBase),
    },
    {
      id: 'realizedCommission',
      header: t('admin.commissions.columns.realized'),
      enableSorting: false,
      meta: { align: 'right' },
      cell: ({ row }) => <span className="font-medium">{formatAmount(row.original.realizedCommission)}</span>,
    },
    {
      id: 'pendingCommission',
      header: t('admin.commissions.columns.pending'),
      enableSorting: false,
      meta: { align: 'right' },
      cell: ({ row }) => (row.original.pendingCommission > 0
        ? formatAmount(row.original.pendingCommission)
        : <span className="text-muted-foreground">—</span>),
    },
    {
      id: 'filter',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSupplierFilter({ id: row.original.supplierId, name: row.original.shopName })
            resetPages()
          }}
        >
          {t('admin.commissions.filterOrders')}
        </Button>
      ),
    },
  ], [t])

  const orderColumns = useMemo<Array<ColumnDef<CommissionOrderRow, unknown>>>(() => [
    {
      id: 'date',
      header: t('admin.commissions.columns.date'),
      enableSorting: false,
      cell: ({ row }) => new Date(row.original.date).toLocaleDateString(i18n.language),
    },
    {
      id: 'orderNumber',
      header: t('admin.commissions.columns.order'),
      enableSorting: false,
      cell: ({ row }) => (
        <Link to={`/admin/commandes/${row.original.id}`} className="font-medium hover:underline">
          {row.original.orderNumber}
        </Link>
      ),
    },
    {
      id: 'supplier',
      header: t('admin.commissions.columns.shop'),
      enableSorting: false,
      cell: ({ row }) => row.original.supplierName,
    },
    {
      id: 'status',
      header: t('admin.commissions.columns.status'),
      enableSorting: false,
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANTS[row.original.status] ?? 'secondary'}>
          {t(`admin.orders.status.${row.original.status}`)}
        </Badge>
      ),
    },
    {
      id: 'base',
      header: t('admin.commissions.columns.base'),
      enableSorting: false,
      meta: { align: 'right' },
      cell: ({ row }) => formatAmount(row.original.base),
    },
    {
      id: 'rate',
      header: t('admin.commissions.columns.rate'),
      enableSorting: false,
      meta: { align: 'right' },
      cell: ({ row }) => formatRate(row.original.rate),
    },
    {
      id: 'commission',
      header: t('admin.commissions.columns.commission'),
      enableSorting: false,
      meta: { align: 'right' },
      cell: ({ row }) => <span className="font-medium">{formatAmount(row.original.commission)}</span>,
    },
  ], [t, i18n.language])

  const totals = summary?.totals

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('admin.commissions.title')}</h2>
          <p className="text-muted-foreground">{t('admin.commissions.description')}</p>
        </div>
        <Button variant="outline" onClick={() => window.open(exportCommissionsCsvUrl(filters), '_blank')}>
          <Download className="mr-2 h-4 w-4" />
          {t('admin.commissions.exportCsv')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="date"
          className="w-40"
          value={from}
          onChange={(event) => {
            setFrom(event.target.value)
            resetPages()
          }}
        />
        <span className="text-muted-foreground text-sm">→</span>
        <Input
          type="date"
          className="w-40"
          value={to}
          onChange={(event) => {
            setTo(event.target.value)
            resetPages()
          }}
        />
        {supplierFilter && (
          <Badge variant="secondary" className="gap-1">
            {supplierFilter.name}
            <button
              type="button"
              aria-label={t('admin.commissions.clearFilter')}
              className="cursor-pointer"
              onClick={() => {
                setSupplierFilter(null)
                resetPages()
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
      </div>

      {isLoading
        ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </div>
          )
        : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label={t('admin.commissions.totals.realized')}
                value={formatAmount(totals?.realizedCommission ?? 0)}
                hint={t('admin.commissions.totals.realizedHint')}
                accent
              />
              <KpiCard
                label={t('admin.commissions.totals.pending')}
                value={formatAmount(totals?.pendingCommission ?? 0)}
                hint={t('admin.commissions.totals.pendingHint', { count: totals?.pendingOrders ?? 0 })}
              />
              <KpiCard
                label={t('admin.commissions.totals.base')}
                value={formatAmount(totals?.realizedBase ?? 0)}
                hint={t('admin.commissions.totals.baseHint')}
              />
              <KpiCard
                label={t('admin.commissions.totals.deliveredOrders')}
                value={String(totals?.deliveredOrders ?? 0)}
                hint={t('admin.commissions.totals.deliveredOrdersHint')}
              />
            </div>
          )}

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.commissions.bySupplier')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={supplierColumns}
            data={summary?.suppliers ?? []}
            total={summary?.total ?? 0}
            page={suppliersPage}
            pageSize={summary?.limit ?? 20}
            onPageChange={setSuppliersPage}
            sorting={[]}
            onSortingChange={() => {}}
            isLoading={isLoading}
            labels={{
              empty: t('admin.commissions.empty'),
              resultCount: count => t('dataTable.resultCount', { count }),
              pageOf: (current, lastPage) => t('dataTable.pageOf', { page: current, lastPage }),
              previous: t('dataTable.previous'),
              next: t('dataTable.next'),
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.commissions.orderDetail')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={orderColumns}
            data={orders?.items ?? []}
            total={orders?.total ?? 0}
            page={ordersPage}
            pageSize={orders?.limit ?? 20}
            onPageChange={setOrdersPage}
            sorting={[]}
            onSortingChange={() => {}}
            isLoading={isLoadingOrders}
            labels={{
              empty: t('admin.commissions.empty'),
              resultCount: count => t('dataTable.resultCount', { count }),
              pageOf: (current, lastPage) => t('dataTable.pageOf', { page: current, lastPage }),
              previous: t('dataTable.previous'),
              next: t('dataTable.next'),
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
