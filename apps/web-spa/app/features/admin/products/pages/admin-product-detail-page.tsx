import type { ReactNode } from 'react'
import type { VisibilityIssue } from '../utils/products-queries'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { cn } from '@boilerstone/ui/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Award, CheckCircle2, ImageOff, Pencil, Star } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { BackLink } from '@/features/admin/common/components/back-link'
import { StatusBadge } from '@/features/admin/common/components/status-badge'
import { ORDER_STATUS_TONES } from '@/features/admin/orders/utils/order-status'
import { Can } from '@/lib/casl/can'
import { ProductModerationPanel } from '../components/product-moderation-panel'
import { fetchAdminProductDetailQueryOptions } from '../utils/products-queries'

function formatAmount(value: number): string {
  return `${value.toLocaleString('fr-FR').replace(/\u202F/g, '\u00A0')}\u00A0FCFA`
}

/**
 * Where each visibility issue is fixed, the shop's page for most of them.
 * Null for eBio's own decisions, taken in the moderation panel just above.
 */
const ISSUE_TARGET: Record<VisibilityIssue, 'shop' | 'studio' | null> = {
  SHOP_NOT_VALIDATED: 'shop',
  SHOP_NOT_LOCATED: 'shop',
  SHOP_CONTACT_ONLY: 'shop',
  PRODUCT_HIDDEN: 'studio',
  PENDING_REVIEW: null,
  REJECTED: null,
  WITHDRAWN: null,
  OUT_OF_STOCK: 'studio',
  NO_PHOTO: 'studio',
}

/**
 * A product as staff need it: what buyers see, how it sells, who bought it
 * lately, what they thought, and, first of all, whether a buyer can find
 * and order it at all, with every reason why not.
 */
export default function AdminProductDetailPage() {
  const { t, i18n } = useTranslation()
  const { productId } = useParams()
  const { data, isLoading, isError, refetch } = useQuery(fetchAdminProductDetailQueryOptions(productId!))
  const [photoIndex, setPhotoIndex] = useState(0)
  const formatDate = (value: string | null) => (value ? new Date(value).toLocaleDateString(i18n.language) : '-')

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-80" />
          <Skeleton className="h-80 lg:col-span-2" />
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border py-16 text-center">
        <AlertTriangle className="text-destructive h-8 w-8" />
        <p className="font-medium">{t('admin.products.detail.error')}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>{t('dataTable.retry')}</Button>
      </div>
    )
  }

  const { product, shop, sales, recentOrders, reviews, certifications, visibilityIssues } = data
  const photos = product.photos ?? []
  const photo = photos[Math.min(photoIndex, photos.length - 1)]
  const hasDiscount = product.promotionalPrice !== null && product.promotionalPrice < product.pricePerUnit
  const studioPath = `/catalogue/${product.id}/modifier?boutique=${shop.id}`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <BackLink fallback="/admin/produits" />
        <h2 className="text-2xl font-bold">{product.name}</h2>
        <StatusBadge tone={product.status === 'ACTIVE' ? 'done' : product.status === 'HIDDEN' ? 'idle' : 'problem'}>
          {t(`admin.products.status.${product.status}`)}
        </StatusBadge>
        <Can action="manage" subject="Product">
          <Button asChild className="ml-auto">
            <Link to={studioPath}>
              <Pencil className="mr-2 h-4 w-4" />
              {t('admin.products.detail.edit')}
            </Link>
          </Button>
        </Can>
      </div>

      <ProductModerationPanel
        productId={product.id}
        productName={product.name}
        moderationStatus={product.moderationStatus ?? 'APPROVED'}
        moderationReason={product.moderationReason ?? null}
      />

      {visibilityIssues.length === 0
        ? (
            <div className="border-ebio-green-200 bg-ebio-green-50 dark:border-ebio-green-800 dark:bg-ebio-green-900 flex items-center gap-3 rounded-xl border p-4">
              <CheckCircle2 className="text-ebio-green-600 h-5 w-5" />
              <span className="font-medium">{t('admin.products.detail.visible')}</span>
            </div>
          )
        : (
            <div className="border-ebio-earth-200 bg-ebio-earth-50 dark:border-ebio-earth-800 dark:bg-ebio-earth-900 space-y-2 rounded-xl border p-4">
              <p className="flex items-center gap-2 font-medium">
                <AlertTriangle className="text-ebio-earth-600 h-5 w-5" />
                {t('admin.products.detail.notVisible')}
              </p>
              <ul className="space-y-1 pl-7 text-sm">
                {visibilityIssues.map(issue => (
                  <li key={issue} className="flex flex-wrap items-center gap-2">
                    <span>{t(`admin.products.detail.issues.${issue}`)}</span>
                    {ISSUE_TARGET[issue] !== null && (
                      <Link
                        to={ISSUE_TARGET[issue] === 'shop' ? `/admin/fournisseurs/${shop.id}` : studioPath}
                        className="text-primary font-medium underline-offset-4 hover:underline"
                      >
                        {ISSUE_TARGET[issue] === 'shop' ? t('admin.products.detail.openShop') : t('admin.products.detail.edit')}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="bg-muted flex aspect-square items-center justify-center overflow-hidden rounded-xl">
              {photo
                ? <img src={photo} alt={product.name} className="h-full w-full bg-white object-contain" />
                : <ImageOff className="text-muted-foreground h-10 w-10" />}
            </div>
            {photos.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {photos.map((url, index) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setPhotoIndex(index)}
                    className={cn('focus-visible:ring-primary h-14 w-14 overflow-hidden rounded-lg border-2 focus-visible:ring-2 focus-visible:outline-none', index === photoIndex ? 'border-primary' : 'border-transparent')}
                    aria-label={t('admin.products.detail.photo', { index: index + 1 })}
                  >
                    <img src={url} alt="" className="h-full w-full bg-white object-contain" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Figure label={t('admin.products.detail.unitsSold')} value={sales.unitsSold.toLocaleString(i18n.language)} />
            <Figure label={t('admin.products.detail.orders')} value={sales.orderCount.toLocaleString(i18n.language)} />
            <Figure label={t('admin.products.detail.revenue')} value={formatAmount(sales.revenue)} />
            <Figure label={t('admin.products.detail.lastSold')} value={formatDate(sales.lastSoldAt)} plain />
          </div>

          <Card>
            <CardHeader><CardTitle>{t('admin.products.detail.sale')}</CardTitle></CardHeader>
            <CardContent>
              <Info label={t('admin.products.columns.shop')} value={<Link to={`/admin/fournisseurs/${shop.id}`} className="text-primary underline-offset-4 hover:underline">{shop.shopName}</Link>} />
              <Info label={t('admin.products.columns.category')} value={data.categoryName} />
              <Info
                label={t('admin.products.columns.price')}
                value={(
                  <span className="font-mono">
                    {hasDiscount && <span className="text-muted-foreground mr-2 line-through">{formatAmount(product.pricePerUnit)}</span>}
                    {formatAmount(hasDiscount ? product.promotionalPrice! : product.pricePerUnit)}
                  </span>
                )}
              />
              <Info label={t('admin.products.columns.stock')} value={<span className="font-mono">{`${product.stock} (${t('admin.products.detail.alertAt', { count: product.stockAlertThreshold })})`}</span>} />
              {sales.cancelledUnits > 0 && <Info label={t('admin.products.detail.cancelled')} value={<span className="font-mono">{sales.cancelledUnits}</span>} />}
              <Info label={t('admin.products.columns.created')} value={formatDate(product.createdAt)} />
            </CardContent>
          </Card>

          {product.variants.length > 0 && (
            <Card>
              <CardHeader><CardTitle>{t('admin.products.detail.formats')}</CardTitle></CardHeader>
              <CardContent>
                <ul className="divide-y rounded-lg border">
                  {product.variants.map(variant => (
                    <li key={variant.id} className="flex items-center gap-3 p-3 text-sm">
                      <span className="flex-1 font-medium">{variant.label}</span>
                      {variant.packSize && (
                        <span className="text-muted-foreground font-mono text-xs">
                          {t('admin.products.detail.perUnit', { amount: formatAmount(variant.pricePerUnit / variant.packSize) })}
                        </span>
                      )}
                      <span className="text-muted-foreground text-xs">{t('admin.products.detail.available', { count: variant.stock })}</span>
                      <span className="font-mono font-medium">{formatAmount(variant.pricePerUnit)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t('admin.products.detail.description')}</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className={cn('whitespace-pre-line', !product.description && 'text-muted-foreground')}>
              {product.description || t('admin.products.detail.noDescription')}
            </p>
            {certifications.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {certifications.map(item => (
                  <span key={item.code} className="border-ebio-green-200 bg-ebio-green-50 text-ebio-green-800 dark:border-ebio-green-800 dark:bg-ebio-green-900 dark:text-ebio-green-100 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium">
                    {item.logoUrl ? <img src={item.logoUrl} alt="" className="h-4 w-4 object-contain" /> : <Award className="h-3.5 w-3.5" />}
                    {item.name}
                    {!item.isActive && <span className="opacity-70">{` · ${t('admin.certifications.inactive')}`}</span>}
                  </span>
                ))}
              </div>
            )}
            {product.ingredients && <Info label={t('admin.products.detail.ingredients')} value={product.ingredients} />}
            {product.origin && <Info label={t('admin.products.detail.origin')} value={product.origin} />}
            {product.conservation && <Info label={t('admin.products.detail.conservation')} value={product.conservation} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle>{t('admin.products.detail.reviews')}</CardTitle>
            {reviews.average !== null && (
              <span className="flex items-center gap-1 text-sm font-medium">
                <Star className="fill-ebio-earth-400 text-ebio-earth-400 h-4 w-4" />
                {reviews.average.toLocaleString(i18n.language, { maximumFractionDigits: 1 })}
                <span className="text-muted-foreground font-normal">{`(${reviews.count})`}</span>
              </span>
            )}
          </CardHeader>
          <CardContent>
            {reviews.latest.length === 0
              ? <p className="text-muted-foreground text-sm">{t('admin.products.detail.noReviews')}</p>
              : (
                  <ul className="space-y-3">
                    {reviews.latest.map(review => (
                      <li key={review.id} className={cn('rounded-lg border p-3 text-sm', review.isHidden && 'opacity-60')}>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">{`${review.rating}/5`}</span>
                          <span className="text-muted-foreground">{review.buyerName ?? '-'}</span>
                          <span className="text-muted-foreground ml-auto text-xs">{formatDate(review.createdAt)}</span>
                        </div>
                        {review.comment && <p className="mt-1">{review.comment}</p>}
                        {review.isHidden && <p className="text-muted-foreground mt-1 text-xs">{t('admin.products.detail.hiddenReview')}</p>}
                      </li>
                    ))}
                  </ul>
                )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t('admin.products.detail.recentOrders')}</CardTitle></CardHeader>
        <CardContent>
          {recentOrders.length === 0
            ? <p className="text-muted-foreground text-sm">{t('admin.products.detail.noOrders')}</p>
            : (
                <ul className="divide-y rounded-lg border">
                  {recentOrders.map(order => (
                    <li key={`${order.id}-${order.variantLabel ?? ''}`}>
                      <Link to={`/admin/commandes/${order.id}`} className="hover:bg-muted/50 flex flex-wrap items-center gap-3 p-3 text-sm">
                        <span className="font-mono font-medium">{order.orderNumber}</span>
                        <span className="text-muted-foreground">{formatDate(order.createdAt)}</span>
                        <span className="flex-1 truncate">{order.buyerName ?? '-'}</span>
                        <span className="text-muted-foreground">{`${order.quantity} × ${order.variantLabel ?? t('admin.products.detail.unit')}`}</span>
                        <StatusBadge tone={ORDER_STATUS_TONES[order.status] ?? 'idle'}>
                          {t(`admin.orders.status.${order.status}`, { defaultValue: order.status })}
                        </StatusBadge>
                        <span className="w-28 text-right font-mono">{formatAmount(order.total)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
        </CardContent>
      </Card>
    </div>
  )
}

function Info({ label, value }: { label: string, value: ReactNode | null }) {
  return (
    <div className="flex justify-between gap-4 border-b py-2 text-sm last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right">{value ?? '-'}</span>
    </div>
  )
}

function Figure({ label, value, plain = false }: { label: string, value: string, plain?: boolean }) {
  return (
    <div className="bg-card rounded-xl border p-4">
      <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">{label}</p>
      <p className={cn('mt-1 text-xl font-bold tabular-nums', !plain && 'font-mono')}>{value}</p>
    </div>
  )
}
