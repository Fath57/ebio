import type { ProductUnitFormData } from '../forms/product-unit-form'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card } from '@boilerstone/ui/components/primitives/card'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { ProductUnitForm } from '../forms/product-unit-form'
import { createProductUnitMutationOptions } from '../utils/product-units-queries'

export default function ProductUnitCreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const { mutate, isPending } = useMutation({
    ...createProductUnitMutationOptions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'product-units'] })
      queryClient.invalidateQueries({ queryKey: ['product-units', 'active'] })
      navigate('/admin/unites')
    },
    // A duplicate code is the usual refusal; showing it beats a dead button.
    onError: (mutationError: Error) => setError(mutationError.message),
  })

  function handleSubmit(data: ProductUnitFormData) {
    setError(null)
    mutate(data)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/unites')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('common.back')}
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{t('admin.productUnits.addUnit')}</h2>
          <p className="text-sm text-muted-foreground">{t('admin.productUnits.addUnitDescription')}</p>
        </div>
      </div>
      <Card className="p-6">
        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
        <ProductUnitForm onSubmit={handleSubmit} isPending={isPending} />
      </Card>
    </div>
  )
}
