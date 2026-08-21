import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@boilerstone/ui/components/primitives/select'
import { Separator } from '@boilerstone/ui/components/primitives/separator'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@boilerstone/ui/components/primitives/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import {
  ADMIN_ORDER_STATUSES,
  fetchAdminOrderQueryOptions,
  updateAdminOrderStatus,
} from '../utils/orders-queries'

function formatAmount(value: number): string {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

function InfoRow({ label, value }: { label: string, value: string | null }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value ?? '—'}</span>
    </div>
  )
}

export default function AdminOrderDetailPage() {
  const { t, i18n } = useTranslation()
  const { orderId } = useParams()
  const queryClient = useQueryClient()
  const [pendingStatus, setPendingStatus] = useState<string | null>(null)
  const { data: order, isLoading } = useQuery({
    ...fetchAdminOrderQueryOptions(orderId ?? ''),
    enabled: Boolean(orderId),
  })

  const statusMutation = useMutation({
    mutationFn: (status: string) => updateAdminOrderStatus(orderId ?? '', status),
    onSuccess: () => {
      setPendingStatus(null)
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders', orderId] })
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!order) {
    return <p className="text-muted-foreground">{t('admin.orders.notFound')}</p>
  }

  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleString(i18n.language) : null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/commandes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('common.back')}
          </Link>
        </Button>
        <h2 className="text-2xl font-bold">{order.orderNumber}</h2>
        <Badge>{t(`admin.orders.status.${order.status}`)}</Badge>
        {/* Every status is reachable here: the admin's job is unblocking. */}
        <div className="ml-auto flex items-center gap-2">
          <Select
            value={pendingStatus ?? order.status}
            onValueChange={setPendingStatus}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ADMIN_ORDER_STATUSES.map(status => (
                <SelectItem key={status} value={status}>
                  {t(`admin.orders.status.${status}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {pendingStatus && pendingStatus !== order.status && (
            <Button
              size="sm"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate(pendingStatus)}
            >
              {statusMutation.isPending ? t('common.saving') : t('admin.orders.detail.applyStatus')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('admin.orders.detail.parties')}</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow label={t('admin.orders.columns.buyer')} value={order.buyer.name ?? null} />
            <InfoRow label={t('admin.orders.detail.email')} value={order.buyerEmail} />
            <InfoRow label={t('admin.orders.detail.phone')} value={order.buyerPhone} />
            <Separator className="my-2" />
            <InfoRow
              label={t('admin.orders.columns.supplier')}
              value={order.supplier.shopName ?? null}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('admin.orders.detail.logistics')}</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow label={t('admin.orders.detail.pickupMode')} value={order.pickupMode} />
            <InfoRow label={t('admin.orders.detail.paymentMethod')} value={order.paymentMethod} />
            <InfoRow label={t('admin.orders.detail.address')} value={order.deliveryAddress} />
            <InfoRow label={t('admin.orders.detail.slot')} value={order.deliverySlot} />
            <Separator className="my-2" />
            <InfoRow label={t('admin.orders.detail.createdAt')} value={formatDate(order.createdAt)} />
            <InfoRow label={t('admin.orders.detail.acceptedAt')} value={formatDate(order.acceptedAt)} />
            <InfoRow label={t('admin.orders.detail.deliveredAt')} value={formatDate(order.deliveredAt)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.orders.detail.items')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('admin.orders.detail.product')}</TableHead>
                <TableHead className="text-right">{t('admin.orders.detail.quantity')}</TableHead>
                <TableHead className="text-right">{t('admin.orders.detail.unitPrice')}</TableHead>
                <TableHead className="text-right">{t('admin.orders.columns.amount')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map(item => (
                <TableRow key={item.id}>
                  <TableCell>{item.productName}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">{formatAmount(item.unitPrice)}</TableCell>
                  <TableCell className="text-right">{formatAmount(item.totalPrice)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Separator className="my-4" />
          <InfoRow label={t('admin.orders.columns.amount')} value={formatAmount(order.totalAmount)} />
          <InfoRow
            label={t('admin.orders.detail.commissionDetail', {
              rate: (order.commissionRate * 100).toFixed(1),
            })}
            value={formatAmount(order.commissionAmount)}
          />
        </CardContent>
      </Card>
    </div>
  )
}
