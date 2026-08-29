import type { UpdateProduct } from '@boilerstone/openapi-generator/client/types.gen'
import type { ProductFormData } from '../forms/product-form'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { ProductForm } from '../forms/product-form'
import {
  clearProductPromotion,
  fetchProductByIdQueryOptions,
  setProductPromotion,
  updateProductMutationOptions,
} from '../utils/catalog-queries'

export default function ProductEditPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { productId } = useParams()

  const { data: product, isLoading } = useQuery(fetchProductByIdQueryOptions(productId!))
  const hadPromotion = (product as { promotionalPrice?: number | null } | undefined)?.promotionalPrice != null

  const { mutate, isPending } = useMutation({
    mutationFn: async (data: ProductFormData) => {
      // Promotion goes through its own endpoint. `photos` carries the kept
      // existing URLs so an edit no longer wipes photos not re-uploaded.
      const { hasPromotion, promotionalPrice, promotionExpiresAt, ...body } = data
      const updated = await updateProductMutationOptions.mutationFn({
        id: productId!,
        ...(body as unknown as UpdateProduct),
      })
      if (hasPromotion && promotionalPrice && promotionExpiresAt)
        await setProductPromotion(productId!, promotionalPrice, promotionExpiresAt)
      else if (!hasPromotion && hadPromotion)
        await clearProductPromotion(productId!)
      return updated
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['products', productId] })
      toast.success(t('catalog.form.updateSuccess'))
      navigate(`/catalogue/${productId}`)
    },
    onError: () => {
      toast.error(t('catalog.form.updateError'))
    },
  })

  function handleSubmit(data: ProductFormData) {
    mutate(data)
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const initialData = product
    ? (product as unknown as Partial<ProductFormData>)
    : undefined

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/catalogue')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('common.back')}
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{t('catalog.editProduct')}</h2>
          <p className="text-sm text-muted-foreground">{t('catalog.editProductDescription')}</p>
        </div>
      </div>
      <Card className="p-6">
        <ProductForm
          onSubmit={handleSubmit}
          isPending={isPending}
          initialData={initialData}
        />
      </Card>
    </div>
  )
}
