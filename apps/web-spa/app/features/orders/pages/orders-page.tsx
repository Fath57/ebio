import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent } from '@boilerstone/ui/components/primitives/card'
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
import { Package } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { fetchOrdersQueryOptions, ORDER_STATUSES, statusVariantMap } from '../utils/orders-queries'

export default function OrdersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  const { data: orders, isLoading } = useQuery(
    fetchOrdersQueryOptions(statusFilter === 'ALL' ? undefined : statusFilter),
  )

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const hasOrders = orders?.orders && orders.orders.length > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">
            {t('orders.title')}
            {orders?.total != null && (
              <span className="ml-2 text-lg font-normal text-muted-foreground">
                (
                {orders.total}
                )
              </span>
            )}
          </h2>
          <p className="text-muted-foreground">{t('orders.description')}</p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t('orders.filterByStatus')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">
              {t('orders.status.all')}
            </SelectItem>
            {ORDER_STATUSES.map(status => (
              <SelectItem key={status} value={status}>
                {t(`orders.status.${status}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasOrders
        ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('orders.columns.reference')}</TableHead>
                  <TableHead>{t('orders.columns.buyer')}</TableHead>
                  <TableHead>{t('orders.columns.date')}</TableHead>
                  <TableHead>{t('orders.columns.total')}</TableHead>
                  <TableHead>{t('orders.columns.status')}</TableHead>
                  <TableHead>{t('orders.columns.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.orders.map(order => (
                  <TableRow
                    key={order.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/commandes/${order.id}`)}
                  >
                    <TableCell className="font-medium">
                      #
                      {order.orderNumber}
                    </TableCell>
                    <TableCell>{order.buyerName}</TableCell>
                    <TableCell>{new Date(order.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {order.totalAmount}
                      {' '}
                      {t('orders.currency')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariantMap[order.status] || 'outline'}>
                        {t(`orders.status.${order.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/commandes/${order.id}`)
                        }}
                      >
                        {t('common.view')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Package className="size-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">{t('orders.empty.title')}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t('orders.empty.description')}</p>
              </CardContent>
            </Card>
          )}
    </div>
  )
}
