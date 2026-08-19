import type { ProductUnitFormData } from '../forms/product-unit-form'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { ProductUnitForm } from '../forms/product-unit-form'
import { fetchProductUnitQueryOptions, updateProductUnitMutationOptions } from '../utils/product-units-queries'

export default function ProductUnitEditPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { unitId } = useParams()
  const [error, setError] = useState<string | null>(null)

  const { data: unit, isLoading } = useQuery(fetchProductUnitQueryOptions(unitId!))

  const { mutate, isPending } = useMutation({
    ...updateProductUnitMutationOptions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'product-units'] })
      queryClient.invalidateQueries({ queryKey: ['product-units', 'active'] })
      navigate('/admin/unites')
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  })

  function handleSubmit(data: ProductUnitFormData) {
    setError(null)
    // The code is immutable server-side; sending it back would only be noise.
    const { code: _code, ...rest } = data
    mutate({ id: unitId!, ...rest })
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/unites')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('common.back')}
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{t('admin.productUnits.editUnit')}</h2>
          <p className="text-sm text-muted-foreground">{t('admin.productUnits.editUnitDescription')}</p>
        </div>
      </div>
      <Card className="p-6">
        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
        <ProductUnitForm
          onSubmit={handleSubmit}
          isPending={isPending}
          isEditing
          initialData={unit}
        />
      </Card>
    </div>
  )
}
