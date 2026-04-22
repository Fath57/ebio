import type { OrderResponse, OrderStatus } from '../utils/orders-queries'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@boilerstone/ui/components/primitives/dialog'
import { Separator } from '@boilerstone/ui/components/primitives/separator'
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import {
  Banknote,
  Calendar,
  Check,
  CreditCard,
  MapPin,
  Package,
  Truck,
  User,
  XCircle,
} from 'lucide-react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Can } from '@/lib/casl/can'
import { statusVariantMap } from '../utils/orders-queries'

const PROGRESSION_STEPS: OrderStatus[] = [
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'IN_DELIVERY',
  'DELIVERED',
]

function getStepIndex(status: OrderStatus): number {
  const idx = PROGRESSION_STEPS.indexOf(status)
  return idx === -1 ? -1 : idx
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-FR').format(amount)
}

function formatDate(dateStr: string | null): string | null {
  if (!dateStr)
    return null
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr))
}

interface OrderDetailProps {
  order: OrderResponse
  onAccept: (id: string) => void
  onReject: (id: string, reason: string) => void
  onUpdateStatus: (id: string, status: 'PREPARING' | 'READY' | 'IN_DELIVERY') => void
  isPending: boolean
}

export const OrderDetail: React.FC<OrderDetailProps> = ({
  order,
  onAccept,
  onReject,
  onUpdateStatus,
  isPending,
}) => {
  const { t } = useTranslation()
  const [acceptDialogOpen, setAcceptDialogOpen] = React.useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = React.useState(false)
  const [rejectReason, setRejectReason] = React.useState('')

  const currentStepIndex = getStepIndex(order.status)
  const isCancelled = order.status === 'CANCELLED'
  const isDisputed = order.status === 'DISPUTED'
  const isTerminalNegative = isCancelled || isDisputed

  const handleAcceptConfirm = () => {
    onAccept(order.id)
    setAcceptDialogOpen(false)
  }

  const handleRejectConfirm = () => {
    onReject(order.id, rejectReason)
    setRejectDialogOpen(false)
    setRejectReason('')
  }

  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-bold">
            {t('orders.detail.order')}
            {' '}
            #
            {order.orderNumber}
          </h3>
          <p className="text-sm text-muted-foreground">
            {formatDate(order.createdAt)}
          </p>
        </div>
        <Badge
          variant={statusVariantMap[order.status] || 'outline'}
          className="w-fit px-3 py-1 text-sm"
        >
          {t(`orders.status.${order.status}`)}
        </Badge>
      </div>

      {/* ===== Status stepper ===== */}
      {isTerminalNegative
        ? (
            <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <XCircle className="size-6 text-destructive" />
              <p className="font-medium text-destructive">
                {t(`orders.status.${order.status}`)}
              </p>
            </div>
          )
        : (
            <div className="flex items-center">
              {PROGRESSION_STEPS.map((step, index) => {
                const isCompleted = index <= currentStepIndex
                const isCurrent = index === currentStepIndex
                const isLast = index === PROGRESSION_STEPS.length - 1

                return (
                  <React.Fragment key={step}>
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 ${
                          isCompleted
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-muted-foreground/30 bg-background text-muted-foreground/50'
                        } ${isCurrent ? 'ring-2 ring-primary/30 ring-offset-1' : ''}`}
                      >
                        {isCompleted
                          ? <Check className="size-3.5" />
                          : <span className="size-1.5 rounded-full bg-current" />}
                      </div>
                      <span className={`text-center text-[10px] leading-tight ${isCompleted ? 'font-medium' : 'text-muted-foreground'}`}>
                        {t(`orders.status.${step}`)}
                      </span>
                    </div>
                    {!isLast && (
                      <div className={`mx-0.5 h-0.5 flex-1 ${index < currentStepIndex ? 'bg-primary' : 'border-t border-dashed border-muted-foreground/30'}`} />
                    )}
                  </React.Fragment>
                )
              })}
            </div>
          )}

      {/* ===== Two column grid: left = items, right = sidebar ===== */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* Left column — items (2/3 width) */}
        <div className="space-y-6 lg:col-span-2">

          {/* Items list */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t('orders.detail.items')}
                {' '}
                (
                {order.items?.length ?? 0}
                )
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              {order.items?.map((item, idx) => (
                <React.Fragment key={item.id}>
                  {idx > 0 && <Separator className="my-3" />}
                  <div className="flex items-center gap-4">
                    {/* Product photo */}
                    <div className="size-14 shrink-0 overflow-hidden rounded-lg border bg-muted">
                      {item.productPhoto
                        ? <img src={item.productPhoto} alt={item.productName} className="size-full object-cover" />
                        : (
                            <div className="flex size-full items-center justify-center">
                              <Package className="size-5 text-muted-foreground" />
                            </div>
                          )}
                    </div>

                    {/* Product info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.productName}</p>
                      {item.variantLabel && (
                        <p className="text-xs text-muted-foreground">{item.variantLabel}</p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {item.quantity}
                        {' '}
                        ×
                        {formatCurrency(item.unitPrice)}
                        {' '}
                        {t('orders.currency')}
                      </p>
                    </div>

                    {/* Total */}
                    <p className="shrink-0 font-semibold">
                      {formatCurrency(item.totalPrice)}
                      {' '}
                      {t('orders.currency')}
                    </p>
                  </div>
                </React.Fragment>
              ))}

              {/* Total row */}
              <Separator className="my-3" />
              <div className="flex items-center justify-between pt-1">
                <span className="font-bold">{t('orders.detail.total')}</span>
                <span className="text-lg font-bold">
                  {formatCurrency(order.totalAmount)}
                  {' '}
                  {t('orders.currency')}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Action buttons */}
          <Can action="update" subject="Order">
            {order.status === 'PLACED' && (
              <div className="flex gap-3">
                <Button onClick={() => setAcceptDialogOpen(true)} disabled={isPending}>
                  {t('orders.actions.accept')}
                </Button>
                <Button variant="destructive" onClick={() => setRejectDialogOpen(true)} disabled={isPending}>
                  {t('orders.actions.reject')}
                </Button>
              </div>
            )}

            {order.status === 'ACCEPTED' && (
              <Button onClick={() => onUpdateStatus(order.id, 'PREPARING')} disabled={isPending}>
                {t('orders.actions.startPreparing')}
              </Button>
            )}

            {order.status === 'PREPARING' && (
              <Button onClick={() => onUpdateStatus(order.id, 'READY')} disabled={isPending}>
                {t('orders.actions.markReady')}
              </Button>
            )}

            {order.status === 'READY' && (
              <Button onClick={() => onUpdateStatus(order.id, 'IN_DELIVERY')} disabled={isPending}>
                {t('orders.actions.markInDelivery')}
              </Button>
            )}
          </Can>
        </div>

        {/* Right column — sidebar (1/3 width) */}
        <div className="space-y-6">

          {/* Buyer info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('orders.detail.buyerInfo')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <User className="size-4 shrink-0 text-muted-foreground" />
                <span>{order.buyerName}</span>
              </div>
              <Separator />
              <div className="flex items-center gap-2">
                {order.pickupMode === 'DELIVERY'
                  ? <Truck className="size-4 shrink-0 text-muted-foreground" />
                  : <MapPin className="size-4 shrink-0 text-muted-foreground" />}
                <span>
                  {order.pickupMode === 'DELIVERY'
                    ? t('orders.detail.delivery')
                    : t('orders.detail.onSite')}
                </span>
              </div>
              {order.pickupMode === 'DELIVERY' && order.deliveryAddress && (
                <p className="pl-6 text-muted-foreground">{order.deliveryAddress}</p>
              )}
              {order.deliverySlot && (
                <div className="flex items-center gap-2">
                  <Calendar className="size-4 shrink-0 text-muted-foreground" />
                  <span>{order.deliverySlot}</span>
                </div>
              )}
              <Separator />
              <div className="flex items-center gap-2">
                {order.paymentMethod === 'FEDAPAY'
                  ? <CreditCard className="size-4 shrink-0 text-muted-foreground" />
                  : <Banknote className="size-4 shrink-0 text-muted-foreground" />}
                <span>
                  {order.paymentMethod === 'FEDAPAY'
                    ? t('orders.detail.fedapay')
                    : t('orders.detail.cashOnDelivery')}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Financial summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('orders.detail.financialSummary')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>{t('orders.detail.subtotal')}</span>
                <span>
                  {formatCurrency(order.totalAmount - order.commissionAmount)}
                  {' '}
                  {t('orders.currency')}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>
                  {t('orders.detail.commission')}
                  {' '}
                  (
                  {order.commissionRate}
                  %)
                </span>
                <span>
                  {formatCurrency(order.commissionAmount)}
                  {' '}
                  {t('orders.currency')}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between font-bold">
                <span>{t('orders.detail.total')}</span>
                <span>
                  {formatCurrency(order.totalAmount)}
                  {' '}
                  {t('orders.currency')}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('orders.detail.timeline')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-0">
                {[
                  { label: t('orders.detail.orderPlaced'), date: order.createdAt },
                  { label: t('orders.detail.orderAccepted'), date: order.acceptedAt },
                  { label: t('orders.detail.orderDelivered'), date: order.deliveredAt },
                  { label: t('orders.detail.escrowReleased'), date: order.escrowReleasedAt },
                ].map((entry, index, arr) => {
                  const formatted = formatDate(entry.date)
                  const isActive = !!entry.date
                  const isLastActive = isActive && (index === arr.length - 1 || !arr[index + 1]?.date)

                  return (
                    <div key={entry.label} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div
                          className={`size-2.5 shrink-0 rounded-full border-2 ${
                            isActive
                              ? 'border-primary bg-primary'
                              : 'border-muted-foreground/30 bg-background'
                          }`}
                        />
                        {index < arr.length - 1 && (
                          <div className={`w-0.5 flex-1 min-h-5 ${isActive && !isLastActive ? 'bg-primary' : 'bg-muted-foreground/20'}`} />
                        )}
                      </div>
                      <div className="pb-3">
                        <p className={`text-xs ${isActive ? 'font-medium' : 'text-muted-foreground'}`}>
                          {entry.label}
                        </p>
                        {formatted && (
                          <p className="text-[11px] text-muted-foreground">{formatted}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ===== Dialogs ===== */}
      <Dialog open={acceptDialogOpen} onOpenChange={setAcceptDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('orders.detail.confirmAccept')}</DialogTitle>
            <DialogDescription>{t('orders.detail.confirmAcceptDesc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcceptDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleAcceptConfirm} disabled={isPending}>
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('orders.detail.confirmReject')}</DialogTitle>
            <DialogDescription>{t('orders.detail.confirmRejectDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('orders.detail.rejectReason')}</label>
            <Textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder={t('orders.detail.rejectReasonPlaceholder')}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={isPending || !rejectReason.trim()}
            >
              {t('orders.actions.reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
