import type { ReactNode } from 'react'
import type { AdminExportProduct } from '../utils/terroir-types'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@boilerstone/ui/components/primitives/sheet'
import { ImageOff, RotateCcw, Undo2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ProductThumb } from '@/features/admin/common/components/product-thumb'
import { Can } from '@/lib/casl/can'
import { formatDateTime, formatGrams } from '../utils/terroir-format'
import { CriteriaList } from './criteria-list'
import { ZoomableImage } from './image-lightbox'
import { ExportStatusBadge } from './terroir-status-badges'

interface ExportProductSheetProps {
  product: AdminExportProduct
  isPending: boolean
  onWithdraw: () => void
  onReinstate: () => void
  onClose: () => void
}

function Fact({ label, value }: { label: string, value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string, children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}

/**
 * Everything eBio needs to judge a product offered for export: each
 * criterion with its state, the label photo to read, the origin and the
 * composition. The criteria decide alone; eBio can only withdraw or reinstate.
 */
export function ExportProductSheet({ product, isPending, onWithdraw, onReinstate, onClose }: ExportProductSheetProps) {
  const { t } = useTranslation()
  const metCount = product.criteria.filter(criterion => criterion.met).length
  const dimensions = product.lengthCm != null && product.widthCm != null && product.heightCm != null
    ? t('admin.terroir.control.dimensionsValue', { length: product.lengthCm, width: product.widthCm, height: product.heightCm })
    : '-'
  const origin = [product.origin.producer, product.origin.place, product.origin.year].filter(Boolean).join(' · ') || '-'
  const declaredAllergens = [...product.composition.allergens, ...(product.allergens ? [product.allergens] : [])]
  const allergens = declaredAllergens.length > 0
    ? declaredAllergens.join(', ')
    : product.noAllergens ? t('admin.terroir.control.noAllergens') : '-'

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next)
          onClose()
      }}
    >
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b p-6 pr-12 text-left">
          <div className="flex items-start gap-4">
            <ProductThumb url={product.imageUrl} size={72} />
            <div className="min-w-0 flex-1 space-y-1">
              <SheetTitle className="text-lg">{product.productName}</SheetTitle>
              <SheetDescription>{`${product.shopName} · ${product.categoryName}`}</SheetDescription>
              <ExportStatusBadge status={product.status} />
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {product.status === 'WITHDRAWN' && (
            <div
              role="note"
              className="border-ebio-coral-200 bg-ebio-coral-50 text-ebio-coral-600 dark:border-ebio-coral-800 dark:bg-ebio-coral-900 dark:text-ebio-coral-100 space-y-1 rounded-md border p-3 text-sm"
            >
              <p className="font-medium">{t('admin.terroir.control.withdrawnOn', { date: formatDateTime(product.withdrawnAt) })}</p>
              {product.withdrawnReason && <p>{product.withdrawnReason}</p>}
            </div>
          )}

          <Section title={t('admin.terroir.control.criteriaTitle', { met: metCount, total: product.criteria.length })}>
            <CriteriaList criteria={product.criteria} />
          </Section>

          <dl className="grid grid-cols-2 gap-3">
            <Fact label={t('admin.terroir.control.weight')} value={product.packedWeightG == null ? '-' : formatGrams(product.packedWeightG)} />
            <Fact
              label={t('admin.terroir.control.shelfLife')}
              value={product.shelfLifeDays == null ? '-' : t('admin.terroir.control.days', { count: product.shelfLifeDays })}
            />
            <Fact label={t('admin.terroir.control.storage')} value={product.storage ? t(`admin.terroir.storage.${product.storage}`) : '-'} />
            <Fact label={t('admin.terroir.control.dimensions')} value={dimensions} />
          </dl>

          <Section title={t('admin.terroir.control.labelPhoto')}>
            {product.labelPhoto
              ? <ZoomableImage url={product.labelPhoto} label={t('admin.terroir.control.labelPhotoOf', { name: product.productName })} size={160} />
              : (
                  <span className="bg-muted text-muted-foreground flex h-[120px] w-[120px] flex-col items-center justify-center gap-1 rounded text-center text-xs">
                    <ImageOff className="h-5 w-5" aria-hidden="true" />
                    {t('admin.terroir.control.noLabelPhoto')}
                  </span>
                )}
          </Section>

          <Section title={t('admin.terroir.control.origin')}>
            <p className="text-sm">{origin}</p>
            {product.origin.method && <p className="text-muted-foreground text-sm">{product.origin.method}</p>}
            {product.origin.photos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {product.origin.photos.map((photo, index) => (
                  <ZoomableImage key={photo} url={photo} label={t('admin.terroir.control.originPhotoOf', { index: index + 1 })} />
                ))}
              </div>
            )}
          </Section>

          <Section title={t('admin.terroir.control.composition')}>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">{t('admin.terroir.control.ingredients')}</dt>
                <dd>{product.composition.ingredients ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">{t('admin.terroir.control.allergens')}</dt>
                <dd>{allergens}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">{t('admin.terroir.control.conservation')}</dt>
                <dd>{product.composition.conservation ?? '-'}</dd>
              </div>
            </dl>
          </Section>

          <p className="text-muted-foreground text-xs">{t('admin.terroir.control.updatedAt', { date: formatDateTime(product.updatedAt) })}</p>
        </div>

        <Can action="manage" subject="Product">
          <SheetFooter className="border-t p-4">
            {product.status === 'WITHDRAWN'
              ? (
                  <Button onClick={onReinstate} disabled={isPending}>
                    <RotateCcw className="mr-1 h-4 w-4" />
                    {isPending ? t('common.saving') : t('admin.terroir.control.reinstate')}
                  </Button>
                )
              : (
                  <Button variant="destructive" onClick={onWithdraw} disabled={isPending}>
                    <Undo2 className="mr-1 h-4 w-4" />
                    {t('admin.terroir.control.withdraw')}
                  </Button>
                )}
          </SheetFooter>
        </Can>
      </SheetContent>
    </Sheet>
  )
}
