import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { PaymentItem } from '../utils/payments-queries'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { DataTable } from '@boilerstone/ui/components/primitives/data-table'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { useQuery } from '@tanstack/react-query'
import { Download, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  exportPaymentsCsvUrl,
  fetchDisputesQueryOptions,
  fetchPaymentsQueryOptions,
} from '../utils/payments-queries'

const PAGE_SIZE = 20

const STATUS_OPTIONS = ['PENDING', 'CAPTURED', 'ESCROW', 'RELEASED', 'REFUNDED', 'FAILED']

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'secondary',
  CAPTURED: 'secondary',
  ESCROW: 'secondary',
  RELEASED: 'default',
  REFUNDED: 'outline',
  FAILED: 'destructive',
}

function formatAmount(value: number): string {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

function TotalCard({ label, value, hint, accent }: {
  label: string
  value: number
  hint: string
  accent?: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold ${accent ? 'text-primary' : ''}`}>{formatAmount(value)}</p>
        <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
      </CardContent>
    </Card>
  )
}

export default function TransactionsPage() {
  const { t, i18n } = useTranslation()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)

  const filters = {
    q: search || undefined,
    status: status || undefined,
    from: from || undefined,
    to: to || undefined,
  }

  const { data, isLoading } = useQuery(fetchPaymentsQueryOptions({ ...filters, page }))
  const { data: disputes, isLoading: isLoadingDisputes } = useQuery(fetchDisputesQueryOptions())

  const columns = useMemo<Array<ColumnDef<PaymentItem, unknown>>>(() => [
    {
      id: 'createdAt',
      header: t('admin.transactions.columns.date'),
      enableSorting: false,
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(i18n.language),
    },
    {
      id: 'orderNumber',
      header: t('admin.transactions.columns.reference'),
      enableSorting: false,
      cell: ({ row }) => (
        <>
          <div className="font-medium">{row.original.orderNumber ?? '—'}</div>
          <div className="text-muted-foreground text-xs">
            {row.original.providerReference ?? row.original.provider}
          </div>
        </>
      ),
    },
    {
      id: 'buyer',
      header: t('admin.transactions.columns.buyer'),
      enableSorting: false,
      cell: ({ row }) => row.original.buyerName,
    },
    {
      id: 'supplier',
      header: t('admin.transactions.columns.supplier'),
      enableSorting: false,
      cell: ({ row }) => row.original.supplierName,
    },
    {
      id: 'status',
      header: t('admin.transactions.columns.status'),
      enableSorting: false,
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANTS[row.original.status] ?? 'outline'}>
          {t(`admin.transactions.status.${row.original.status}`)}
        </Badge>
      ),
    },
    {
      id: 'amount',
      header: t('admin.transactions.columns.amount'),
      enableSorting: false,
      meta: { align: 'right' },
      cell: ({ row }) => formatAmount(row.original.amount),
    },
    {
      id: 'commission',
      header: t('admin.transactions.columns.commission'),
      enableSorting: false,
      meta: { align: 'right' },
      // Zéro tant que le séquestre n'est pas libéré : rien n'est acquis.
      cell: ({ row }) => (row.original.commission > 0
        ? formatAmount(row.original.commission)
        : <span className="text-muted-foreground">—</span>),
    },
  ], [t, i18n.language])

  const totals = data?.totals

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('admin.transactions.title')}</h2>
          <p className="text-muted-foreground">{t('admin.transactions.description')}</p>
        </div>
        <Button variant="outline" onClick={() => window.open(exportPaymentsCsvUrl(filters), '_blank')}>
          <Download className="mr-2 h-4 w-4" />
          {t('admin.transactions.exportCsv')}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TotalCard
          label={t('admin.transactions.totals.collected')}
          value={totals?.collected ?? 0}
          hint={t('admin.transactions.totals.collectedHint')}
        />
        <TotalCard
          label={t('admin.transactions.totals.inEscrow')}
          value={totals?.inEscrow ?? 0}
          hint={t('admin.transactions.totals.inEscrowHint')}
        />
        <TotalCard
          label={t('admin.transactions.totals.commissionEarned')}
          value={totals?.commissionEarned ?? 0}
          hint={t('admin.transactions.totals.commissionEarnedHint')}
          accent
        />
        <TotalCard
          label={t('admin.transactions.totals.refunded')}
          value={totals?.refunded ?? 0}
          hint={t('admin.transactions.totals.refundedHint')}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            className="pl-9"
            value={search}
            placeholder={t('admin.transactions.searchPlaceholder')}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
        </div>
        <select
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)
            setPage(1)
          }}
        >
          <option value="">{t('admin.transactions.allStatuses')}</option>
          {STATUS_OPTIONS.map(value => (
            <option key={value} value={value}>{t(`admin.transactions.status.${value}`)}</option>
          ))}
        </select>
        <Input
          type="date"
          className="w-40"
          value={from}
          onChange={(event) => {
            setFrom(event.target.value)
            setPage(1)
          }}
        />
        <Input
          type="date"
          className="w-40"
          value={to}
          onChange={(event) => {
            setTo(event.target.value)
            setPage(1)
          }}
        />
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        total={data?.total ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        sorting={[]}
        onSortingChange={() => {}}
        isLoading={isLoading}
        labels={{
          empty: t('admin.transactions.empty'),
          resultCount: count => t('dataTable.resultCount', { count }),
          pageOf: (current, lastPage) => t('dataTable.pageOf', { page: current, lastPage }),
          previous: t('dataTable.previous'),
          next: t('dataTable.next'),
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.transactions.disputes.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingDisputes
            ? <Skeleton className="h-24 w-full" />
            : (disputes?.items ?? []).length === 0
                ? (
                    <p className="text-muted-foreground text-sm">
                      {t('admin.transactions.disputes.noDisputes')}
                    </p>
                  )
                : (
                    <div className="space-y-2">
                      {(disputes?.items ?? []).map(dispute => (
                        <div
                          key={dispute.id}
                          className="flex items-center justify-between rounded-md border p-3 text-sm"
                        >
                          <span>{dispute.reason}</span>
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{formatAmount(dispute.amount)}</span>
                            <Badge variant="destructive">{dispute.status}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
        </CardContent>
      </Card>
    </div>
  )
}
