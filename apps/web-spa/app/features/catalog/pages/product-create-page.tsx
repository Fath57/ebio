import type { CreateProduct } from '@boilerstone/openapi-generator/client/types.gen'
import type { ProductFormData } from '../forms/product-form'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card } from '@boilerstone/ui/components/primitives/card'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { ProductForm } from '../forms/product-form'
import { createProductMutationOptions, setProductPromotion } from '../utils/catalog-queries'

export default function ProductCreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { mutate, isPending } = useMutation({
    mutationFn: async (data: ProductFormData) => {
      // Promotion goes through its own endpoint; photos only exist on edit
      const { hasPromotion, promotionalPrice, promotionExpiresAt, photos: _photos, ...body } = data
      const product = await createProductMutationOptions.mutationFn(body as unknown as CreateProduct)
      const productId = (product as { id?: string } | undefined)?.id
      if (productId && hasPromotion && promotionalPrice && promotionExpiresAt)
        await setProductPromotion(productId, promotionalPrice, promotionExpiresAt)
      return product
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success(t('catalog.form.createSuccess'))
      const productId = (data as { id?: string })?.id
      navigate(productId ? `/catalogue/${productId}` : '/catalogue')
    },
    onError: () => {
      toast.error(t('catalog.form.createError'))
    },
  })

  function handleSubmit(data: ProductFormData) {
    mutate(data)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/catalogue')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('common.back')}
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{t('catalog.addProduct')}</h2>
          <p className="text-sm text-muted-foreground">{t('catalog.addProductDescription')}</p>
        </div>
      </div>
      <Card className="p-6">
        <ProductForm onSubmit={handleSubmit} isPending={isPending} />
      </Card>
    </div>
  )
}
