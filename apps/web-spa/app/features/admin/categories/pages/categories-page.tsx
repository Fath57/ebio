import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Dialog as AlertDialog,
  DialogContent as AlertDialogContent,
} from '@boilerstone/ui/components/primitives/dialog'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@boilerstone/ui/components/primitives/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusCircle, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { Can } from '@/lib/casl/can'
import {
  deleteCategoryMutationOptions,
  fetchCategoriesQueryOptions,
} from '../utils/categories-queries'

interface CategoryRecord {
  id: string
  name: string
  slug: string
  imageUrl?: string | null
  sortOrder?: number
  productCount: number
}

export default function CategoriesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null)

  const { data: categoriesData, isLoading } = useQuery(fetchCategoriesQueryOptions())

  const { mutate: deleteCategory, isPending: isDeleting } = useMutation({
    ...deleteCategoryMutationOptions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] })
      setDeletingCategoryId(null)
    },
  })

  const handleConfirmDelete = () => {
    if (deletingCategoryId) {
      deleteCategory(deletingCategoryId)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const categories = categoriesData?.categories ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('admin.categories.title')}</h2>
          <p className="text-muted-foreground">{t('admin.categories.description')}</p>
        </div>
        <Can action="create" subject="Category">
          <Button asChild>
            <Link to="/admin/categories/nouveau">
              <PlusCircle className="mr-2 h-4 w-4" />
              {t('admin.categories.addCategory')}
            </Link>
          </Button>
        </Can>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16" />
            <TableHead>{t('admin.categories.columns.name')}</TableHead>
            <TableHead>{t('admin.categories.columns.slug')}</TableHead>
            <TableHead>{t('admin.categories.columns.sortOrder')}</TableHead>
            <TableHead>{t('admin.categories.columns.productCount')}</TableHead>
            <TableHead>{t('admin.categories.columns.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.map((category: CategoryRecord) => (
            <TableRow key={category.id}>
              <TableCell>
                {category.imageUrl
                  ? <img src={category.imageUrl} alt={category.name} className="h-10 w-10 rounded-lg object-cover" />
                  : <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-sm">📦</div>}
              </TableCell>
              <TableCell className="font-medium">{category.name}</TableCell>
              <TableCell className="text-muted-foreground">{category.slug}</TableCell>
              <TableCell>{category.sortOrder ?? 0}</TableCell>
              <TableCell>
                <Badge variant="secondary">
                  {category.productCount}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Can action="update" subject="Category">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/admin/categories/${category.id}/modifier`)}
                    >
                      {t('common.edit')}
                    </Button>
                  </Can>
                  <Can action="delete" subject="Category">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeletingCategoryId(category.id)}
                      disabled={isDeleting}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </Can>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog open={!!deletingCategoryId} onOpenChange={open => !open && setDeletingCategoryId(null)}>
        <AlertDialogContent>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">{t('admin.categories.deleteConfirm')}</h3>
              <p className="text-sm text-muted-foreground">{t('admin.categories.deleteWarning')}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeletingCategoryId(null)}>{t('common.cancel')}</Button>
              <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
                {t('common.confirm')}
              </Button>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
