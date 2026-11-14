import type { ReviewSubmit } from '../components/review-dialog'
import type { ExportPack, ExportProfileStatus, ExportReviewProduct } from '../utils/terroir-types'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardCheck, ImageOff } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ProductThumb } from '@/features/admin/common/components/product-thumb'
import { StatusTabs } from '@/features/admin/common/components/status-tabs'
import { formatAmount } from '@/features/admin/wallets/utils/format-amount'
import { Can } from '@/lib/casl/can'
import { ZoomableImage } from '../components/image-lightbox'
import { PackBalance } from '../components/pack-balance'
import { ReviewDialog } from '../components/review-dialog'
import { ReviewStatusBadge } from '../components/terroir-status-badges'
import { formatDateTime, formatGrams } from '../utils/terroir-format'
import { reviewPack, reviewProduct, reviewsQueryOptions, terroirKeys } from '../utils/terroir-queries'

const STATUSES: ExportProfileStatus[] = ['PENDING', 'APPROVED', 'REJECTED']

type Reviewing
  = | { kind: 'product', product: ExportReviewProduct }
    | { kind: 'pack', pack: ExportPack }

function isStatus(value: string): value is ExportProfileStatus {
  return (STATUSES as string[]).includes(value)
}

/**
 * The export validation queue: products and packs the shops asked to send
 * abroad. A product is approved only once the six checks are ticked against
 * its label photo; a refusal always carries its reason to the shop.
 */
export default function ExportReviewsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [statusTab, setStatusTab] = useState<string>('PENDING')
  const [reviewing, setReviewing] = useState<Reviewing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const status = isStatus(statusTab) ? statusTab : 'PENDING'
  const { data, isLoading, isError, refetch } = useQuery(reviewsQueryOptions(status))

  const close = () => {
    setReviewing(null)
    setError(null)
  }

  const mutation = useMutation({
    mutationFn: async ({ target, review }: { target: Reviewing, review: ReviewSubmit }) => {
      if (target.kind === 'product')
        await reviewProduct(target.product.productId, review.decision, review.checklist, review.reason)
      else
        await reviewPack(target.pack.id, review.decision, review.reason)
      return review.decision
    },
    onMutate: () => setError(null),
    onSuccess: (decision) => {
      queryClient.invalidateQueries({ queryKey: terroirKeys.reviewsRoot })
      queryClient.invalidateQueries({ queryKey: terroirKeys.packs })
      toast.success(decision === 'APPROVE' ? t('admin.terroir.reviews.approved') : t('admin.terroir.reviews.rejected'))
      close()
    },
    onError: (failure: Error) => setError(failure.message || t('admin.terroir.genericError')),
  })

  const products = data?.products ?? []
  const packs = data?.packs ?? []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t('admin.terroir.reviews.title')}</h2>
        <p className="text-muted-foreground">{t('admin.terroir.reviews.description')}</p>
      </div>

      <StatusTabs
        allTab={false}
        tabs={STATUSES.map(value => ({
          value,
          label: t(`admin.terroir.reviewStatus.${value}`),
          tone: value === 'PENDING' ? 'action' : undefined,
        }))}
        value={status}
        onChange={setStatusTab}
        counts={data ? { [status]: products.length + packs.length } : undefined}
      />

      {isError && (
        <div className="space-y-2" role="alert">
          <p className="text-destructive">{t('admin.terroir.loadError')}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>{t('common.retry')}</Button>
        </div>
      )}

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">{t('admin.terroir.reviews.products', { count: products.length })}</h3>
        {isLoading && <Skeleton className="h-40 w-full" />}
        {data && products.length === 0 && <p className="text-muted-foreground text-sm">{t('admin.terroir.reviews.noProducts')}</p>}
        {products.map(product => (
          <ProductReviewCard
            key={product.productId}
            product={product}
            onReview={() => setReviewing({ kind: 'product', product })}
          />
        ))}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">{t('admin.terroir.reviews.packs', { count: packs.length })}</h3>
        {data && packs.length === 0 && <p className="text-muted-foreground text-sm">{t('admin.terroir.reviews.noPacks')}</p>}
        {packs.map(pack => (
          <PackReviewCard key={pack.id} pack={pack} onReview={() => setReviewing({ kind: 'pack', pack })} />
        ))}
      </section>

      {reviewing && (
        <ReviewDialog
          key={reviewing.kind === 'product' ? reviewing.product.productId : reviewing.pack.id}
          title={reviewing.kind === 'product'
            ? t('admin.terroir.reviews.productDialogTitle', { name: reviewing.product.productName })
            : t('admin.terroir.reviews.packDialogTitle', { name: reviewing.pack.name })}
          description={reviewing.kind === 'product'
            ? t('admin.terroir.reviews.productDialogDescription', { shop: reviewing.product.shopName })
            : t('admin.terroir.reviews.packDialogDescription', { shop: reviewing.pack.shopName ?? 'eBio' })}
          withChecklist={reviewing.kind === 'product'}
          hasLabelPhoto={reviewing.kind === 'product' ? Boolean(reviewing.product.labelPhoto) : true}
          initialChecklist={reviewing.kind === 'product' ? reviewing.product.checklist : undefined}
          isPending={mutation.isPending}
          error={error}
          onClose={close}
          onSubmit={review => mutation.mutate({ target: reviewing, review })}
        />
      )}
    </div>
  )
}

function Fact({ label, value }: { label: string, value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  )
}

function ProductReviewCard({ product, onReview }: { product: ExportReviewProduct, onReview: () => void }) {
  const { t } = useTranslation()
  const dimensions = [product.lengthCm, product.widthCm, product.heightCm].every(value => value != null)
    ? t('admin.terroir.reviews.dimensionsValue', { length: product.lengthCm, width: product.widthCm, height: product.heightCm })
    : '—'
  const origin = [product.origin.producer, product.origin.place, product.origin.year].filter(Boolean).join(' · ') || '—'

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex flex-wrap items-start gap-4">
          <ProductThumb url={product.imageUrl} size={72} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold">{product.productName}</p>
              <ReviewStatusBadge status={product.status} />
            </div>
            <p className="text-muted-foreground text-sm">{`${product.shopName} · ${product.categoryName}`}</p>
            <p className="text-muted-foreground text-xs">{t('admin.terroir.reviews.updatedAt', { date: formatDateTime(product.updatedAt) })}</p>
          </div>
          <Can action="manage" subject="Product">
            <Button size="sm" onClick={onReview}>
              <ClipboardCheck className="mr-1 h-4 w-4" />
              {t('admin.terroir.reviews.review')}
            </Button>
          </Can>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label={t('admin.terroir.reviews.weight')} value={formatGrams(product.packedWeightG)} />
          <Fact label={t('admin.terroir.reviews.shelfLife')} value={t('admin.terroir.reviews.days', { count: product.shelfLifeDays })} />
          <Fact label={t('admin.terroir.reviews.dimensions')} value={dimensions} />
          <Fact label={t('admin.terroir.reviews.origin')} value={origin} />
        </dl>

        <div className="grid gap-4 md:grid-cols-[auto_1fr]">
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">{t('admin.terroir.reviews.labelPhoto')}</p>
            {product.labelPhoto
              ? <ZoomableImage url={product.labelPhoto} label={t('admin.terroir.reviews.labelPhotoOf', { name: product.productName })} size={120} />
              : (
                  <span className="bg-muted text-muted-foreground flex h-[120px] w-[120px] flex-col items-center justify-center gap-1 rounded text-center text-xs">
                    <ImageOff className="h-5 w-5" aria-hidden="true" />
                    {t('admin.terroir.reviews.noLabelPhotoShort')}
                  </span>
                )}
          </div>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">{t('admin.terroir.reviews.ingredients')}</dt>
              <dd>{product.composition.ingredients ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{t('admin.terroir.reviews.allergens')}</dt>
              <dd>{product.composition.allergens.length > 0 ? product.composition.allergens.join(', ') : t('admin.terroir.reviews.noAllergens')}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{t('admin.terroir.reviews.conservation')}</dt>
              <dd>{product.composition.conservation ?? '—'}</dd>
            </div>
            {product.origin.method && (
              <div>
                <dt className="text-muted-foreground text-xs">{t('admin.terroir.reviews.method')}</dt>
                <dd>{product.origin.method}</dd>
              </div>
            )}
          </dl>
        </div>

        {product.origin.photos.length > 0 && (
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">{t('admin.terroir.reviews.originPhotos')}</p>
            <div className="flex flex-wrap gap-2">
              {product.origin.photos.map((photo, index) => (
                <ZoomableImage key={photo} url={photo} label={t('admin.terroir.reviews.originPhotoOf', { index: index + 1 })} />
              ))}
            </div>
          </div>
        )}

        {product.rejectionReason && (
          <p className="text-sm">
            <span className="text-muted-foreground">{t('admin.terroir.reviews.rejectionReason')}</span>
            {' '}
            {product.rejectionReason}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function PackReviewCard({ pack, onReview }: { pack: ExportPack, onReview: () => void }) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex flex-wrap items-start gap-4">
          <ProductThumb url={pack.photos[0] ?? pack.items[0]?.imageUrl ?? null} size={72} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold">{pack.name}</p>
              <ReviewStatusBadge status={pack.status} />
            </div>
            <p className="text-muted-foreground text-sm">{pack.shopName ?? t('admin.terroir.packs.byEbio')}</p>
            {pack.description && <p className="text-sm">{pack.description}</p>}
          </div>
          {pack.status !== 'RETIRED' && (
            <Can action="manage" subject="Product">
              <Button size="sm" onClick={onReview}>
                <ClipboardCheck className="mr-1 h-4 w-4" />
                {t('admin.terroir.reviews.review')}
              </Button>
            </Can>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <ul className="divide-y">
            {pack.items.map(item => (
              <li key={`${item.productId}-${item.variantId ?? ''}`} className="flex items-center gap-3 py-2">
                <ProductThumb url={item.imageUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{`${item.quantity} × ${item.name}`}</p>
                  <p className="text-muted-foreground text-xs">{`${item.shopName} · ${formatAmount(item.unitPrice)}`}</p>
                </div>
                {item.exportStatus && item.exportStatus !== 'APPROVED' && <ReviewStatusBadge status={item.exportStatus} />}
              </li>
            ))}
          </ul>
          <PackBalance price={pack.price} linesTotal={pack.linesTotal} className="md:w-72" />
        </div>
        {pack.rejectionReason && (
          <p className="text-sm">
            <span className="text-muted-foreground">{t('admin.terroir.reviews.rejectionReason')}</span>
            {' '}
            {pack.rejectionReason}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
