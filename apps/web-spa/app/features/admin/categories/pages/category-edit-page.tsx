import type { CategoryFormData } from '../forms/category-form'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { CategoryForm } from '../forms/category-form'
import { fetchCategoryByIdQueryOptions, updateCategoryMutationOptions } from '../utils/categories-queries'

export default function CategoryEditPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { categoryId } = useParams()

  const { data: category, isLoading } = useQuery(fetchCategoryByIdQueryOptions(categoryId!))

  const { mutate, isPending } = useMutation({
    ...updateCategoryMutationOptions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] })
      navigate('/admin/categories')
    },
  })

  function handleSubmit(data: CategoryFormData) {
    mutate({ id: categoryId!, ...data })
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const initialData = category
    ? {
        name: category.name,
        slug: category.slug,
        imageUrl: category.imageUrl ?? undefined,
        sortOrder: category.sortOrder ?? 0,
      }
    : undefined

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/categories')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('common.back')}
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{t('admin.categories.editCategory')}</h2>
          <p className="text-sm text-muted-foreground">{t('admin.categories.editCategoryDescription')}</p>
        </div>
      </div>
      <Card className="p-6">
        <CategoryForm
          onSubmit={handleSubmit}
          isPending={isPending}
          initialData={initialData}
        />
      </Card>
    </div>
  )
}
