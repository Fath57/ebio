import type { ReactNode } from 'react'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { cn } from '@boilerstone/ui/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ExternalLink, ImageOff } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { BackLink } from '@/features/admin/common/components/back-link'
import { StatusBadge } from '@/features/admin/common/components/status-badge'
import { ORDER_STATUS_TONES } from '@/features/admin/orders/utils/order-status'
import { JOURNAL_TONES, PAYMENT_STATUS_TONES } from '../utils/payment-status'
import { fetchPaymentDetailQueryOptions } from '../utils/payments-queries'

function formatAmount(value: number): string {
  return `${value.toLocaleString('fr-FR').replace(/\u202F/g, '\u00A0')}\u00A0FCFA`
}

/**
 * One payment, end to end: what the buyer paid, for which order and cart,
 * what the provider said at each step, and what moved on eBio wallets since.
 * The page support opens when a buyer, a shop or a courier asks about money.
 */
export default function TransactionDetailPage() {
  const { t, i18n } = useTranslation()
  const { paymentId } = useParams()
  const { data, isLoading, isError, refetch } = useQuery(fetchPaymentDetailQueryOptions(paymentId!))
  const formatDate = (value: string | null) => (value
    ? new Date(value).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })
    : null)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border py-16 text-center">
        <AlertTriangle className="text-destructive h-8 w-8" />
        <p className="font-medium">{t('admin.transactions.detail.error')}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>{t('dataTable.retry')}</Button>
      </div>
    )
  }

  const { payment, order, checkout, providerJournal, walletMovements, dispute } = data

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <BackLink fallback="/admin/transactions" />
        <h2 className="font-mono text-2xl font-bold">{formatAmount(payment.amount)}</h2>
        <StatusBadge tone={PAYMENT_STATUS_TONES[payment.status] ?? 'idle'}>
          {t(`admin.transactions.status.${payment.status}`, { defaultValue: payment.status })}
        </StatusBadge>
        {order && (
          <span className="text-muted-foreground">
            {t('admin.transactions.detail.forOrder')}
            {' '}
            <Link to={`/admin/commandes/${order.id}`} className="text-primary font-mono font-medium underline-offset-4 hover:underline">
              {order.orderNumber}
            </Link>
          </span>
        )}
      </div>

      {dispute && (
        <div className="border-ebio-coral-200 bg-ebio-coral-50 dark:border-ebio-coral-800 dark:bg-ebio-coral-900 flex flex-wrap items-center gap-3 rounded-xl border p-4">
          <AlertTriangle className="text-ebio-coral-600 h-5 w-5" />
          <span className="font-medium">{t('admin.transactions.detail.dispute')}</span>
          <StatusBadge tone={dispute.status === 'OPEN' ? 'problem' : 'idle'}>{dispute.status}</StatusBadge>
          {dispute.reason && <span className="text-muted-foreground text-sm">{dispute.reason}</span>}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t('admin.transactions.detail.payment')}</CardTitle></CardHeader>
          <CardContent>
            <Info label={t('admin.transactions.detail.provider')} value={payment.provider} />
            <Info label={t('admin.transactions.detail.method')} value={payment.paymentMethod} />
            <Info label={t('admin.transactions.detail.operator')} value={payment.operator} />
            <Info label={t('admin.transactions.detail.phone')} value={payment.phoneNumber} mono />
            <Info label={t('admin.transactions.detail.providerReference')} value={payment.providerReference ?? payment.providerTransactionId} mono />
            {payment.receiptUrl && (
              <Info
                label={t('admin.transactions.detail.receipt')}
                value={(
                  <a href={payment.receiptUrl} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline">
                    {t('admin.transactions.detail.openReceipt')}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t('admin.transactions.detail.timeline')}</CardTitle></CardHeader>
          <CardContent>
            <ol className="space-y-3">
              <Step label={t('admin.transactions.detail.created')} at={formatDate(payment.createdAt)} />
              <Step label={t('admin.transactions.detail.paid')} at={formatDate(payment.paidAt)} />
              <Step label={t('admin.transactions.detail.released')} at={formatDate(payment.releasedAt)} />
              {payment.refundedAt && <Step label={t('admin.transactions.detail.refunded')} at={formatDate(payment.refundedAt)} />}
            </ol>
          </CardContent>
        </Card>
      </div>

      {order && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle>{t('admin.transactions.detail.order')}</CardTitle>
            <StatusBadge tone={ORDER_STATUS_TONES[order.status] ?? 'idle'}>
              {t(`admin.orders.status.${order.status}`, { defaultValue: order.status })}
            </StatusBadge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-x-8 sm:grid-cols-2">
              <Info label={t('admin.orders.columns.buyer')} value={order.buyer.name ?? null} />
              <Info
                label={t('admin.orders.columns.supplier')}
                value={order.supplier.id
                  ? <Link to={`/admin/fournisseurs/${order.supplier.id}`} className="text-primary underline-offset-4 hover:underline">{order.supplier.shopName}</Link>
                  : order.supplier.shopName ?? null}
              />
              <Info label={t('admin.orders.detail.email')} value={order.buyerEmail} />
              <Info label={t('admin.orders.detail.phone')} value={order.buyerPhone} mono />
            </div>
            <ul className="divide-y rounded-lg border">
              {order.items.map(item => (
                <li key={item.id} className="flex items-center gap-3 p-3">
                  <ItemPhoto src={item.productThumbnail ?? item.productPhoto} alt={item.productName} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.productName}</span>
                    <span className="text-muted-foreground font-mono text-xs">
                      {`${item.quantity} × ${formatAmount(item.unitPrice)}`}
                      {item.isGift && ` · ${t('admin.transactions.detail.gift')}`}
                    </span>
                  </span>
                  <span className="font-mono text-sm font-medium">{formatAmount(item.totalPrice)}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-6 text-sm">
              <span className="text-muted-foreground">{t('admin.orders.columns.commission')}</span>
              <span className="font-mono">{formatAmount(order.commissionAmount)}</span>
              <span className="text-muted-foreground">{t('admin.orders.columns.amount')}</span>
              <span className="font-mono font-semibold">{formatAmount(order.totalAmount)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {checkout && checkout.orders.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('admin.transactions.detail.cart')}</CardTitle>
            <p className="text-muted-foreground text-sm">
              {t('admin.transactions.detail.cartHint', { count: checkout.orders.length, total: formatAmount(checkout.totalAmount) })}
            </p>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-lg border">
              {checkout.orders.map(sibling => (
                <li key={sibling.id}>
                  <Link to={`/admin/commandes/${sibling.id}`} className="hover:bg-muted/50 flex items-center gap-3 p-3">
                    <span className="font-mono font-medium">{sibling.orderNumber}</span>
                    <span className="text-muted-foreground flex-1 truncate">{sibling.supplierName}</span>
                    <StatusBadge tone={ORDER_STATUS_TONES[sibling.status] ?? 'idle'}>
                      {t(`admin.orders.status.${sibling.status}`, { defaultValue: sibling.status })}
                    </StatusBadge>
                    <span className="font-mono text-sm">{formatAmount(sibling.totalAmount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.transactions.detail.journal')}</CardTitle>
          <p className="text-muted-foreground text-sm">{t('admin.transactions.detail.journalHint')}</p>
        </CardHeader>
        <CardContent>
          {providerJournal.length === 0
            ? <p className="text-muted-foreground text-sm">{t('admin.transactions.detail.journalEmpty')}</p>
            : (
                <ul className="divide-y rounded-lg border">
                  {providerJournal.map(entry => (
                    <li key={`${entry.kind}-${entry.createdAt}-${entry.reference ?? ''}`} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                      <span className="text-muted-foreground w-40">{formatDate(entry.createdAt)}</span>
                      <span className="font-medium">{t(`admin.transactions.detail.kinds.${entry.kind}`, { defaultValue: entry.kind })}</span>
                      <span className="text-muted-foreground font-mono text-xs">{entry.reference ?? '—'}</span>
                      <StatusBadge tone={JOURNAL_TONES[entry.status] ?? 'idle'}>
                        {t(`admin.transactions.detail.journalStatus.${entry.status}`, { defaultValue: entry.status })}
                      </StatusBadge>
                      {entry.providerStatus && <span className="text-muted-foreground text-xs">{`(${entry.providerStatus})`}</span>}
                      {entry.failureReason && <span className="text-ebio-coral-600 text-xs">{entry.failureReason}</span>}
                      <span className="ml-auto font-mono">{formatAmount(entry.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.transactions.detail.movements')}</CardTitle>
          <p className="text-muted-foreground text-sm">{t('admin.transactions.detail.movementsHint')}</p>
        </CardHeader>
        <CardContent>
          {walletMovements.length === 0
            ? <p className="text-muted-foreground text-sm">{t('admin.transactions.detail.movementsEmpty')}</p>
            : (
                <ul className="divide-y rounded-lg border">
                  {walletMovements.map(movement => (
                    <li key={movement.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                      <span className="text-muted-foreground w-40">{formatDate(movement.createdAt)}</span>
                      <span className="w-48 truncate font-medium">{movement.ownerLabel}</span>
                      <span className="text-muted-foreground min-w-0 flex-1 truncate">
                        {movement.description ?? t(`admin.transactions.detail.movementTypes.${movement.type}`, { defaultValue: movement.type })}
                      </span>
                      <span className={cn('font-mono font-medium', movement.amount < 0 ? 'text-ebio-coral-600' : 'text-ebio-green-600')}>
                        {`${movement.amount > 0 ? '+' : ''}${formatAmount(movement.amount)}`}
                      </span>
                      <span className="text-muted-foreground w-32 text-right font-mono text-xs">
                        {t('admin.transactions.detail.balanceAfter', { amount: formatAmount(movement.balanceAfter) })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
        </CardContent>
      </Card>
    </div>
  )
}

function Info({ label, value, mono = false }: { label: string, value: ReactNode | null, mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('text-right', mono && 'font-mono')}>{value ?? '—'}</span>
    </div>
  )
}

function Step({ label, at }: { label: string, at: string | null }) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', at ? 'bg-ebio-green-400' : 'bg-muted-foreground/30')} />
      <span className={cn('flex-1', !at && 'text-muted-foreground')}>{label}</span>
      <span className="text-muted-foreground">{at ?? '—'}</span>
    </li>
  )
}

/** A product line always shows its picture; a dead link falls back to the placeholder. */
function ItemPhoto({ src, alt }: { src: string | null, alt: string }) {
  const [broken, setBroken] = useState(false)
  if (!src || broken) {
    return (
      <span className="bg-muted text-muted-foreground flex h-11 w-11 shrink-0 items-center justify-center rounded-lg">
        <ImageOff className="h-4 w-4" />
      </span>
    )
  }
  return <img src={src} alt={alt} className="h-11 w-11 shrink-0 rounded-lg bg-white object-contain" onError={() => setBroken(true)} />
}
