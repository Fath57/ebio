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
import { ArrowLeft, Star, Truck } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { fetchAdminDeliveryQueryOptions } from '../../deliveries/utils/deliveries-queries'
import {
  ADMIN_ORDER_STATUSES,
  fetchAdminOrderQueryOptions,
  updateAdminOrderStatus,
} from '../utils/orders-queries'

/** The back office may still pick the courier until the parcel leaves the shop. */
const ASSIGNABLE_DELIVERY_STATUSES = new Set(['AWAITING_COURIER', 'ACCEPTED'])

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

/** Five stars, the first `rating` ones filled, plus the optional buyer comment. */
function RatingRow({ label, rating, comment }: { label: string, rating: number, comment: string | null }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex flex-col items-end gap-1 text-right">
        <span className="flex items-center gap-0.5" aria-label={`${rating} / 5`}>
          {Array.from({ length: 5 }, (_, index) => (
            <Star
              key={index}
              className={`h-4 w-4 ${index < rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}`}
              aria-hidden
            />
          ))}
        </span>
        {comment && <span className="font-normal italic text-muted-foreground">{`« ${comment} »`}</span>}
      </span>
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
  // The order summary only carries status + courier; fees, tip and rating live
  // on the full delivery resource.
  const deliveryId = order?.delivery?.id ?? ''
  const { data: delivery } = useQuery({
    ...fetchAdminDeliveryQueryOptions(deliveryId),
    enabled: Boolean(deliveryId),
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
  const readyAround = order.status === 'PREPARING' && order.estimatedReadyAt
    ? new Date(order.estimatedReadyAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })
    : null

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
        {readyAround && (
          <span className="text-sm text-muted-foreground">
            {t('admin.orders.detail.readyAround', { time: readyAround })}
          </span>
        )}
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

        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>{t('admin.orders.detail.delivery')}</CardTitle>
            {order.delivery && ASSIGNABLE_DELIVERY_STATUSES.has(order.delivery.status) && (
              <Button size="sm" variant={order.delivery.courierId ? 'outline' : 'default'} asChild>
                <Link to={`/admin/livraisons/${order.delivery.id}/assigner`}>
                  <Truck className="mr-2 h-4 w-4" />
                  {t(order.delivery.courierId ? 'admin.orders.detail.changeCourier' : 'admin.orders.detail.assignCourier')}
                </Link>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {order.delivery
              ? (
                  <>
                    <InfoRow
                      label={t('admin.orders.detail.deliveryStatus')}
                      value={t(`admin.deliveries.statuses.${order.delivery.status}`)}
                    />
                    <InfoRow
                      label={t('admin.orders.detail.courier')}
                      value={order.delivery.courierName ?? t('admin.deliveries.noCourier')}
                    />
                    {delivery && (
                      <>
                        <Separator className="my-2" />
                        <InfoRow label={t('admin.orders.detail.deliveryFee')} value={formatAmount(delivery.deliveryFee)} />
                        <InfoRow label={t('admin.orders.detail.courierFee')} value={formatAmount(delivery.courierFee)} />
                        {delivery.tipAmount > 0 && (
                          <InfoRow label={t('admin.orders.detail.tip')} value={formatAmount(delivery.tipAmount)} />
                        )}
                        {delivery.buyerRating && (
                          <RatingRow
                            label={t('admin.orders.detail.buyerRating')}
                            rating={delivery.buyerRating.rating}
                            comment={delivery.buyerRating.comment}
                          />
                        )}
                      </>
                    )}
                  </>
                )
              : (
                  <p className="text-sm text-muted-foreground">{t('admin.orders.detail.noDelivery')}</p>
                )}
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
                <TableRow key={item.id} className={item.isGift ? 'text-muted-foreground' : undefined}>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-2">
                      {item.productName}
                      {item.isGift && <Badge variant="secondary">{t('admin.orders.detail.gift')}</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">{formatAmount(item.isGift ? 0 : item.unitPrice)}</TableCell>
                  <TableCell className="text-right">{formatAmount(item.isGift ? 0 : item.totalPrice)}</TableCell>
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
          {order.deliverySponsor && (
            <InfoRow
              label={t(`admin.orders.detail.sponsoredDelivery.${order.deliverySponsor}`)}
              value={formatAmount(order.sponsoredDeliveryFee)}
            />
          )}
          {order.platformPromoCompensation > 0 && (
            <InfoRow
              label={t('admin.orders.detail.promoCompensation')}
              value={formatAmount(order.platformPromoCompensation)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
