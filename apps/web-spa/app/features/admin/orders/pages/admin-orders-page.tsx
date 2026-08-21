import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { AdminOrderListItem } from '../utils/orders-queries'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { useServerSorting } from '@/features/admin/common/utils/use-server-sorting'
import { fetchAdminOrdersQueryOptions } from '../utils/orders-queries'

const PAGE_SIZE = 20

/** Statuts de commande, dans l'ordre du cycle de vie. */
const STATUS_OPTIONS = [
  'PENDING_PAYMENT',
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'IN_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'DISPUTED',
]

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PLACED: 'secondary',
  ACCEPTED: 'default',
  PREPARING: 'default',
  READY: 'default',
  IN_DELIVERY: 'default',
  DELIVERED: 'outline',
  CANCELLED: 'destructive',
  DISPUTED: 'destructive',
}

function formatAmount(value: number): string {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

export default function AdminOrdersPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const resetPage = useCallback(() => setPage(1), [])
  const { sorting, setSorting, sortBy, sortDir } = useServerSorting('createdAt', resetPage)

  const { data, isLoading } = useQuery(
    fetchAdminOrdersQueryOptions({
      q: search || undefined,
      status: status || undefined,
      sortBy,
      sortDir,
      page,
    }),
  )

  const columns = useMemo<Array<ColumnDef<AdminOrderListItem, unknown>>>(() => [
    {
      id: 'orderNumber',
      header: t('admin.orders.columns.number'),
      cell: ({ row }) => <span className="font-medium">{row.original.orderNumber}</span>,
    },
    {
      id: 'createdAt',
      header: t('admin.orders.columns.date'),
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(i18n.language),
    },
    {
      id: 'buyer',
      header: t('admin.orders.columns.buyer'),
      cell: ({ row }) => row.original.buyer.name,
    },
    {
      id: 'supplier',
      header: t('admin.orders.columns.supplier'),
      cell: ({ row }) => row.original.supplier.shopName,
    },
    {
      id: 'status',
      header: t('admin.orders.columns.status'),
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANTS[row.original.status] ?? 'secondary'}>
          {t(`admin.orders.status.${row.original.status}`)}
        </Badge>
      ),
    },
    {
      id: 'totalAmount',
      header: t('admin.orders.columns.amount'),
      meta: { align: 'right' },
      cell: ({ row }) => formatAmount(row.original.totalAmount),
    },
    {
      id: 'commissionAmount',
      header: t('admin.orders.columns.commission'),
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatAmount(row.original.commissionAmount)}</span>
      ),
    },
  ], [t, i18n.language])

  return (
    <AdminListShell
      title={t('admin.orders.title')}
      description={t('admin.orders.description')}
      searchValue={search}
      onSearchChange={(value) => {
        setSearch(value)
        setPage(1)
      }}
      searchPlaceholder={t('admin.orders.searchPlaceholder')}
      filters={(
        <select
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)
            setPage(1)
          }}
        >
          <option value="">{t('admin.orders.allStatuses')}</option>
          {STATUS_OPTIONS.map(value => (
            <option key={value} value={value}>
              {t(`admin.orders.status.${value}`)}
            </option>
          ))}
        </select>
      )}
      columns={columns}
      data={data?.items ?? []}
      total={data?.total ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      onPageChange={setPage}
      sorting={sorting}
      onSortingChange={setSorting}
      onRowClick={order => navigate(`/admin/commandes/${order.id}`)}
      isLoading={isLoading}
      emptyLabel={t('admin.orders.empty')}
    />
  )
}
