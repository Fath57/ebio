import type { DeliveryWindowSubmit } from '../forms/delivery-window-form'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@boilerstone/ui/components/primitives/dialog'
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
import { AlertTriangle, CalendarClock, ImageOff, Star, Truck } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { BackLink } from '@/features/admin/common/components/back-link'
import { StatusBadge } from '@/features/admin/common/components/status-badge'
import { Can } from '@/lib/casl/can'
import { fetchAdminDeliveryQueryOptions, formatDistance } from '../../deliveries/utils/deliveries-queries'
import { DeliveryWindowForm } from '../forms/delivery-window-form'
import { formatBeninWindow, WINDOW_EDITABLE_ORDER_STATUSES } from '../utils/delivery-window'
import { ORDER_STATUS_TONES } from '../utils/order-status'
import {
  ADMIN_ORDER_STATUSES,
  fetchAdminOrderQueryOptions,
  updateAdminOrderDeliveryWindow,
  updateAdminOrderStatus,
} from '../utils/orders-queries'

/** The back office may still pick the courier until the parcel leaves the shop. */
const ASSIGNABLE_DELIVERY_STATUSES = new Set(['AWAITING_COURIER', 'ACCEPTED'])

function formatAmount(value: number | string): string {
  // Numeric columns can reach the page as strings: coerce, or no thousands separator.
  return `${Number(value).toLocaleString('fr-FR')} FCFA`
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

/** « 45,73 € », « 18,29 $US »: an amount in the payer's currency. */
function formatForeign(value: number, currency: string, locale: string): string {
  return value.toLocaleString(locale, { style: 'currency', currency })
}

/** Proof taken far from the door: an icon and words, never the colour alone. */
function FarBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full border border-ebio-earth-200 bg-ebio-earth-50 px-2.5 text-xs font-medium whitespace-nowrap text-ebio-earth-800 dark:border-ebio-earth-800 dark:bg-ebio-earth-900 dark:text-ebio-earth-100">
      <AlertTriangle className="h-3 w-3" aria-hidden />
      {label}
    </span>
  )
}

export default function AdminOrderDetailPage() {
  const { t, i18n } = useTranslation()
  const { orderId } = useParams()
  const queryClient = useQueryClient()
  const [pendingStatus, setPendingStatus] = useState<string | null>(null)
  const [isWindowDialogOpen, setIsWindowDialogOpen] = useState(false)
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

  const windowMutation = useMutation({
    mutationFn: (input: DeliveryWindowSubmit) => updateAdminOrderDeliveryWindow(orderId ?? '', input),
    onSuccess: () => {
      setIsWindowDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'deliveries'] })
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
  const canEditWindow = order.pickupMode === 'DELIVERY' && WINDOW_EDITABLE_ORDER_STATUSES.has(order.status)
  const windowLabel = order.deliveryWindowStart && order.deliveryWindowEnd
    ? formatBeninWindow(order.deliveryWindowStart, order.deliveryWindowEnd)
    : t('admin.orders.window.asap')
  const readyAround = order.status === 'PREPARING' && order.estimatedReadyAt
    ? new Date(order.estimatedReadyAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BackLink fallback="/admin/commandes" />
        <h2 className="text-2xl font-bold">{order.orderNumber}</h2>
        <StatusBadge tone={ORDER_STATUS_TONES[order.status] ?? 'idle'}>
          {t(`admin.orders.status.${order.status}`)}
        </StatusBadge>
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
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>{t('admin.orders.detail.logistics')}</CardTitle>
            {canEditWindow && (
              <Can action="manage" subject="Order">
                <Button size="sm" variant="outline" onClick={() => setIsWindowDialogOpen(true)}>
                  <CalendarClock className="mr-2 h-4 w-4" />
                  {t('admin.orders.window.edit')}
                </Button>
              </Can>
            )}
          </CardHeader>
          <CardContent>
            <InfoRow label={t('admin.orders.detail.pickupMode')} value={order.pickupMode ? t(`admin.orders.pickupModes.${order.pickupMode}`, { defaultValue: order.pickupMode }) : null} />
            <InfoRow label={t('admin.orders.detail.paymentMethod')} value={order.paymentMethod ? t(`admin.orders.paymentMethods.${order.paymentMethod}`, { defaultValue: order.paymentMethod }) : null} />
            <InfoRow label={t('admin.orders.detail.address')} value={order.deliveryAddress} />
            <InfoRow label={t('admin.orders.detail.slot')} value={order.deliverySlot} />
            {order.pickupMode === 'DELIVERY' && (
              <InfoRow label={t('admin.orders.window.label')} value={windowLabel} />
            )}
            <Separator className="my-2" />
            <InfoRow label={t('admin.orders.detail.createdAt')} value={formatDate(order.createdAt)} />
            <InfoRow label={t('admin.orders.detail.acceptedAt')} value={formatDate(order.acceptedAt)} />
            <InfoRow label={t('admin.orders.detail.deliveredAt')} value={formatDate(order.deliveredAt)} />
          </CardContent>
        </Card>

        {order.gift && (
          <Card>
            <CardHeader>
              <CardTitle>{t('admin.orders.gift.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <InfoRow label={t('admin.orders.gift.payer')} value={order.gift.payer.name} />
              <InfoRow label={t('admin.orders.gift.recipient')} value={order.gift.recipient.name || null} />
              <InfoRow label={t('admin.orders.gift.recipientPhone')} value={order.gift.recipient.phone} />
            </CardContent>
          </Card>
        )}

        {order.proof && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>{t('admin.orders.proof.title')}</CardTitle>
              {order.proof.far && <FarBadge label={t('admin.orders.proof.far')} />}
            </CardHeader>
            <CardContent className="space-y-3">
              {order.proof.photoUrl
                ? (
                    <a href={order.proof.photoUrl} target="_blank" rel="noreferrer" className="block w-fit rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                      <img
                        src={order.proof.photoUrl}
                        alt={t('admin.orders.proof.photoAlt', { number: order.orderNumber })}
                        loading="lazy"
                        className="aspect-[4/3] w-full max-w-sm rounded-lg object-cover"
                      />
                    </a>
                  )
                : (
                    <p className="bg-muted text-muted-foreground flex aspect-[4/3] w-full max-w-sm flex-col items-center justify-center gap-2 rounded-lg text-sm">
                      <ImageOff className="h-5 w-5" aria-hidden />
                      {t('admin.orders.proof.noPhoto')}
                    </p>
                  )}
              <div>
                <InfoRow label={t('admin.orders.proof.takenAt')} value={formatDate(order.proof.takenAt)} />
                <InfoRow
                  label={t('admin.orders.proof.distance')}
                  value={order.proof.distanceM === null ? null : formatDistance(order.proof.distanceM, i18n.language)}
                />
              </div>
            </CardContent>
          </Card>
        )}

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

      <Dialog open={isWindowDialogOpen} onOpenChange={setIsWindowDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.orders.window.title', { number: order.orderNumber })}</DialogTitle>
            <DialogDescription>{t('admin.orders.window.description')}</DialogDescription>
          </DialogHeader>
          {windowMutation.error && (
            <p className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
              {windowMutation.error.message}
            </p>
          )}
          <DeliveryWindowForm
            order={order}
            isPending={windowMutation.isPending}
            onSubmit={input => windowMutation.mutate(input)}
            onCancel={() => setIsWindowDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

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
                    <span className="flex items-center gap-3">
                      {item.productThumbnail || item.productPhoto
                        ? (
                            <img
                              src={item.productThumbnail ?? item.productPhoto ?? ''}
                              alt=""
                              loading="lazy"
                              className="size-10 shrink-0 rounded-md object-cover"
                            />
                          )
                        : <span className="bg-muted size-10 shrink-0 rounded-md" />}
                      <span className="flex flex-wrap items-center gap-2">
                        {item.productName}
                        {item.isGift && <Badge variant="secondary">{t('admin.orders.detail.gift')}</Badge>}
                      </span>
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
          {order.display && (
            <>
              <InfoRow
                label={t('admin.orders.gift.paidIn', { currency: order.display.currency })}
                value={formatForeign(order.display.total, order.display.currency, i18n.language)}
              />
              <InfoRow
                label={t('admin.orders.gift.frozenRate')}
                value={t('admin.orders.gift.rateValue', {
                  unit: (1).toLocaleString(i18n.language, { style: 'currency', currency: order.display.currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }),
                  rate: order.display.rate.toLocaleString(i18n.language, { maximumFractionDigits: 2 }),
                })}
              />
            </>
          )}
          <InfoRow
            label={t('admin.orders.detail.commissionDetail', {
              rate: (Number(order.commissionRate) * 100).toLocaleString(i18n.language, { maximumFractionDigits: 1 }),
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
