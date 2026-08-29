import type { NutritionalValues } from '@boilerstone/openapi-generator/client/types.gen'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Separator } from '@boilerstone/ui/components/primitives/separator'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, Box, Clock, Edit, ImageOff, Package, ShoppingCart, Tag, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { fetchActiveProductUnitsQueryOptions } from '@/features/admin/product-units/utils/product-units-queries'
import { ProductCompositionSection } from '../components/product-composition-section'
import { fetchProductByIdQueryOptions } from '../utils/catalog-queries'

interface Variant { id: string, label: string, pricePerUnit: number, stock: number }

interface ProductStats {
  totalOrders: number
  totalQuantitySold: number
  totalRevenue: number
  averageOrderQuantity: number
}

interface ProductDetail {
  id: string
  name: string
  description: string | null
  categoryId: string
  categoryName: string
  photos: string[]
  pricePerUnit: number
  unit: string
  stock: number
  stockAlertThreshold: number
  status: string
  promotionalPrice: number | null
  promotionExpiresAt: string | null
  variants: Variant[]
  stats?: ProductStats
  ingredients?: string | null
  allergens?: string[] | null
  labels?: string[] | null
  origin?: string | null
  conservation?: string | null
  nutritionalValues?: NutritionalValues | null
  createdAt: string
  updatedAt: string
}

function formatPrice(n: number): string {
  return n.toLocaleString('fr-FR')
}

export default function ProductDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { productId } = useParams()
  const [selectedPhoto, setSelectedPhoto] = useState(0)
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null)

  const { data, isLoading } = useQuery(fetchProductByIdQueryOptions(productId!))
  const { data: unitsData } = useQuery(fetchActiveProductUnitsQueryOptions())
  const product = data as ProductDetail | undefined

  if (isLoading) {
    return (
      <div className="grid gap-10 lg:grid-cols-[1fr_1fr] max-w-6xl mx-auto">
        <Skeleton className="aspect-square w-full rounded-2xl" />
        <div className="space-y-4 py-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-14 w-1/2" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Package className="h-12 w-12 text-muted-foreground" />
        <p className="mt-4 text-lg font-medium">{t('catalog.detail.notFound')}</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/catalogue')}>
          {t('common.back')}
        </Button>
      </div>
    )
  }

  const hasPromotion = product.promotionalPrice != null && product.promotionalPrice < product.pricePerUnit
  const discountPercent = hasPromotion ? Math.round((1 - product.promotionalPrice! / product.pricePerUnit) * 100) : 0
  const activePrice = selectedVariant?.pricePerUnit ?? (hasPromotion ? product.promotionalPrice! : product.pricePerUnit)
  const originalPrice = selectedVariant?.pricePerUnit ?? product.pricePerUnit
  const activeStock = selectedVariant?.stock ?? product.stock
  const isOutOfStock = activeStock === 0 || product.status === 'OUT_OF_STOCK'
  // Read from the reference list, not from a translation key: a unit added
  // from the backoffice has no key and would print « catalog.units.botte ».
  const unitLabel = unitsData?.items.find(unit => unit.code === product.unit)?.label ?? product.unit

  return (
    <div className="max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-sm text-muted-foreground">
        <button type="button" onClick={() => navigate('/catalogue')} className="hover:text-foreground transition-colors">
          {t('catalog.title')}
        </button>
        <span>/</span>
        <span className="text-foreground font-medium truncate">{product.name}</span>
      </div>

      {/* ===== 2-col equal split ===== */}
      <div className="grid gap-10 lg:grid-cols-2">

        {/* LEFT — Photos */}
        <div className="space-y-4">
          {product.photos.length > 0
            ? (
                <>
                  <div className="relative overflow-hidden rounded-2xl bg-muted aspect-square">
                    <img
                      src={product.photos[selectedPhoto]}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                    {hasPromotion && !selectedVariant && (
                      <div className="absolute left-4 top-4 rounded-full bg-ebio-coral-400 px-3 py-1 text-sm font-bold text-white shadow-lg">
                        -
                        {discountPercent}
                        %
                      </div>
                    )}
                    {product.status === 'HIDDEN' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Badge variant="secondary" className="text-base px-4 py-2">{t('catalog.status.hidden')}</Badge>
                      </div>
                    )}
                    {isOutOfStock && product.status !== 'HIDDEN' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Badge variant="destructive" className="text-base px-4 py-2">{t('catalog.status.outOfStock')}</Badge>
                      </div>
                    )}
                  </div>
                  {product.photos.length > 1 && (
                    <div className="flex gap-3">
                      {product.photos.map((url, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setSelectedPhoto(i)}
                          className={`h-20 w-20 overflow-hidden rounded-xl transition-all ${
                            i === selectedPhoto
                              ? 'ring-2 ring-primary ring-offset-2'
                              : 'opacity-60 hover:opacity-100'
                          }`}
                        >
                          <img src={url} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )
            : (
                <div className="flex aspect-square items-center justify-center rounded-2xl bg-muted">
                  <ImageOff className="h-20 w-20 text-muted-foreground/20" />
                </div>
              )}
        </div>

        {/* RIGHT — Product info */}
        <div className="flex flex-col py-2">
          {/* Category + Status */}
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="outline" className="gap-1 text-xs">
              <Tag className="h-3 w-3" />
              {product.categoryName}
            </Badge>
            {product.status === 'ACTIVE' && (
              <Badge className="bg-ebio-green-600 text-xs">{t('catalog.status.active')}</Badge>
            )}
            {product.status === 'OUT_OF_STOCK' && (
              <Badge variant="destructive" className="text-xs">{t('catalog.status.outOfStock')}</Badge>
            )}
          </div>

          {/* Name */}
          <h1 className="text-3xl font-bold tracking-tight">{product.name}</h1>

          {/* Price */}
          <div className="mt-4 space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-4xl font-extrabold tracking-tight text-primary">
                {formatPrice(activePrice)}
              </span>
              <span className="text-lg text-muted-foreground">
                FCFA /
                {unitLabel}
              </span>
            </div>
            {hasPromotion && !selectedVariant && (
              <div className="flex items-center gap-3 text-sm">
                <span className="font-mono text-muted-foreground line-through">
                  {formatPrice(originalPrice)}
                  {' '}
                  FCFA
                </span>
                {product.promotionExpiresAt && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {t('catalog.detail.until')}
                    {' '}
                    {new Date(product.promotionExpiresAt).toLocaleDateString('fr-FR')}
                  </span>
                )}
              </div>
            )}
          </div>

          <Separator className="my-5" />

          {/* Variants */}
          {product.variants.length > 0 && (
            <div className="mb-5">
              <p className="text-sm font-semibold mb-3">{t('catalog.form.variants')}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedVariant(null)}
                  className={`rounded-xl border-2 px-4 py-2.5 text-sm font-medium transition-all ${
                    !selectedVariant
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:border-primary/30'
                  }`}
                >
                  <span>{t('catalog.detail.standard')}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {formatPrice(hasPromotion ? product.promotionalPrice! : product.pricePerUnit)}
                  </span>
                </button>
                {product.variants.map(v => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVariant(v)}
                    disabled={v.stock === 0}
                    className={`rounded-xl border-2 px-4 py-2.5 text-sm font-medium transition-all ${
                      selectedVariant?.id === v.id
                        ? 'border-primary bg-primary/5 text-primary'
                        : v.stock === 0
                          ? 'border-border opacity-40 cursor-not-allowed'
                          : 'border-border hover:border-primary/30'
                    }`}
                  >
                    <span>{v.label}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {formatPrice(v.pricePerUnit)}
                    </span>
                    {v.stock === 0 && (
                      <span className="ml-1 text-xs text-destructive">
                        (
                        {t('catalog.status.outOfStock')}
                        )
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stock */}
          <div className="flex items-center gap-2 mb-5">
            <Box className={`h-4 w-4 ${isOutOfStock ? 'text-destructive' : 'text-ebio-green-600'}`} />
            <span className={`text-sm font-medium ${isOutOfStock ? 'text-destructive' : ''}`}>
              {isOutOfStock
                ? t('catalog.status.outOfStock')
                : `${t('catalog.detail.inStock')} — ${activeStock} ${unitLabel}`}
            </span>
          </div>

          {/* Stats */}
          {product.stats && product.stats.totalOrders > 0 && (
            <div className="grid grid-cols-3 gap-3 rounded-xl bg-muted/50 p-4">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <ShoppingCart className="h-3.5 w-3.5" />
                  <span className="text-xs">{t('catalog.detail.orders')}</span>
                </div>
                <span className="text-xl font-bold">{product.stats.totalOrders}</span>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <BarChart3 className="h-3.5 w-3.5" />
                  <span className="text-xs">{t('catalog.detail.sold')}</span>
                </div>
                <span className="text-xl font-bold">
                  {product.stats.totalQuantitySold}
                  {' '}
                  <span className="text-xs font-normal text-muted-foreground">{unitLabel}</span>
                </span>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span className="text-xs">{t('catalog.detail.revenue')}</span>
                </div>
                <span className="text-xl font-bold font-mono">
                  {formatPrice(product.stats.totalRevenue)}
                </span>
                <span className="text-xs text-muted-foreground ml-1">FCFA</span>
              </div>
            </div>
          )}

          {/* Description */}
          {product.description && (
            <div className="mb-6">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {product.description}
              </p>
            </div>
          )}

          {/* Spacer to push action to bottom */}
          <div className="flex-1" />

          {/* Action */}
          <Button
            size="lg"
            className="w-full mt-4"
            onClick={() => navigate(`/catalogue/${product.id}/modifier`)}
          >
            <Edit className="mr-2 h-4 w-4" />
            {t('catalog.detail.editProduct')}
          </Button>

          {/* Meta */}
          <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
            <span>
              {t('catalog.detail.created')}
              {' '}
              {new Date(product.createdAt).toLocaleDateString('fr-FR')}
            </span>
            <span>
              {t('catalog.detail.updated')}
              {' '}
              {new Date(product.updatedAt).toLocaleDateString('fr-FR')}
            </span>
          </div>
        </div>
      </div>

      {/* ===== Composition & product sheet ===== */}
      <ProductCompositionSection
        ingredients={product.ingredients}
        allergens={product.allergens}
        labels={product.labels}
        origin={product.origin}
        conservation={product.conservation}
        nutritionalValues={product.nutritionalValues}
      />
    </div>
  )
}
