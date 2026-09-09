import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@boilerstone/ui/components/primitives/select'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@boilerstone/ui/components/primitives/table'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import {
  ASSIGNABLE_STATUSES,
  DELIVERIES_PAGE_SIZE,
  DELIVERY_STATUSES,
  fetchAdminDeliveriesQueryOptions,
  formatRelative,
} from '../utils/deliveries-queries'

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  AWAITING_COURIER: 'destructive',
  ACCEPTED: 'secondary',
  PICKED_UP: 'secondary',
  IN_TRANSIT: 'default',
  DELIVERED: 'outline',
  FAILED: 'destructive',
  CANCELLED: 'outline',
}

export default function AdminDeliveriesPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [status, setStatus] = useState('AWAITING_COURIER')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery(
    fetchAdminDeliveriesQueryOptions({
      status: status === 'ALL' ? undefined : status,
      page,
    }),
  )

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / DELIVERIES_PAGE_SIZE))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('admin.deliveries.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('admin.deliveries.description')}</p>
        </div>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-56" aria-label={t('admin.deliveries.filterByStatus')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('admin.deliveries.statuses.all')}</SelectItem>
            {DELIVERY_STATUSES.map(value => (
              <SelectItem key={value} value={value}>
                {t(`admin.deliveries.statuses.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {data?.deliveries.length === 0
        ? (
            <p className="text-muted-foreground">{t('admin.deliveries.empty')}</p>
          )
        : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.deliveries.columns.order')}</TableHead>
                  <TableHead>{t('admin.deliveries.columns.shop')}</TableHead>
                  <TableHead>{t('admin.deliveries.columns.dropoff')}</TableHead>
                  <TableHead>{t('admin.deliveries.columns.courier')}</TableHead>
                  <TableHead>{t('admin.deliveries.columns.status')}</TableHead>
                  <TableHead>{t('admin.deliveries.columns.updatedAt')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.deliveries.map((delivery) => {
                  const assignable = ASSIGNABLE_STATUSES.includes(delivery.status)
                  const lastEvent = delivery.events[delivery.events.length - 1]
                  return (
                    <TableRow
                      key={delivery.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/admin/commandes/${delivery.orderId}`)}
                    >
                      <TableCell className="font-medium">{delivery.orderNumber}</TableCell>
                      <TableCell>{delivery.supplierShopName}</TableCell>
                      <TableCell className="max-w-xs truncate">{delivery.dropoffAddress}</TableCell>
                      <TableCell>
                        {delivery.courier?.name ?? (
                          <span className="text-muted-foreground">{t('admin.deliveries.noCourier')}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[delivery.status] ?? 'outline'}>
                          {t(`admin.deliveries.statuses.${delivery.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatRelative(lastEvent?.occurredAt ?? delivery.createdAt, i18n.language)}
                      </TableCell>
                      <TableCell className="text-right">
                        {assignable && (
                          <Button size="sm" variant={delivery.courier ? 'outline' : 'default'} asChild>
                            <Link to={`/admin/livraisons/${delivery.id}/assigner`} onClick={event => event.stopPropagation()}>
                              {t(delivery.courier ? 'admin.deliveries.changeCourier' : 'admin.deliveries.assign')}
                            </Link>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ←
          </Button>
          <span className="text-sm text-muted-foreground">
            {page}
            {' / '}
            {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            →
          </Button>
        </div>
      )}
    </div>
  )
}
