import type { CategoryFormData } from '../forms/category-form'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card } from '@boilerstone/ui/components/primitives/card'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { CategoryForm } from '../forms/category-form'
import { createCategoryMutationOptions } from '../utils/categories-queries'

export default function CategoryCreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { mutate, isPending } = useMutation({
    ...createCategoryMutationOptions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] })
      navigate('/admin/categories')
    },
  })

  function handleSubmit(data: CategoryFormData) {
    mutate(data)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/categories')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('common.back')}
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{t('admin.categories.addCategory')}</h2>
          <p className="text-sm text-muted-foreground">{t('admin.categories.addCategoryDescription')}</p>
        </div>
      </div>
      <Card className="p-6">
        <CategoryForm onSubmit={handleSubmit} isPending={isPending} />
      </Card>
    </div>
  )
}
