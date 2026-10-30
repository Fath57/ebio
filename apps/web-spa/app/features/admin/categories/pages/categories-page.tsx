import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ImageOff, Pencil, PlusCircle, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { ConfirmDialog } from '@/features/admin/common/components/confirm-dialog'
import { useAbility } from '@/lib/casl/ability-context'
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
  const { ability } = useAbility()
  const canUpdate = ability?.can('update', 'Category') ?? false
  const [deleting, setDeleting] = useState<CategoryRecord | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data, isLoading, isError, refetch } = useQuery(fetchCategoriesQueryOptions())

  const { mutate: deleteCategory, isPending: isDeleting } = useMutation({
    ...deleteCategoryMutationOptions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] })
      setDeleting(null)
    },
    onError: (error: Error) => setDeleteError(error.message || t('common.error')),
  })

  const columns = useMemo<Array<ColumnDef<CategoryRecord, unknown>>>(() => [
    {
      id: 'image',
      header: '',
      meta: { className: 'w-16' },
      cell: ({ row }) => <CategoryThumbnail category={row.original} />,
    },
    {
      id: 'name',
      header: t('admin.categories.columns.name'),
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="font-medium">{row.original.name}</span>
          <span className="text-muted-foreground font-mono text-xs">{row.original.slug}</span>
        </span>
      ),
    },
    {
      id: 'sortOrder',
      header: t('admin.categories.columns.sortOrder'),
      meta: { numeric: true },
      cell: ({ row }) => row.original.sortOrder ?? 0,
    },
    {
      id: 'productCount',
      header: t('admin.categories.columns.productCount'),
      meta: { numeric: true },
      cell: ({ row }) => row.original.productCount,
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Can action="update" subject="Category">
            <Button size="icon" variant="ghost" asChild aria-label={t('common.edit')}>
              <Link to={`/admin/categories/${row.original.id}/modifier`}>
                <Pencil className="h-4 w-4" />
              </Link>
            </Button>
          </Can>
          <Can action="delete" subject="Category">
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('common.delete')}
              disabled={isDeleting}
              onClick={() => {
                setDeleteError(null)
                setDeleting(row.original)
              }}
            >
              <Trash2 className="text-destructive h-4 w-4" />
            </Button>
          </Can>
        </div>
      ),
    },
  ], [t, isDeleting])

  const categories: CategoryRecord[] = data?.categories ?? []

  return (
    <>
      <AdminListShell
        title={t('admin.categories.title')}
        description={t('admin.categories.description')}
        actions={(
          <Can action="create" subject="Category">
            <Button asChild>
              <Link to="/admin/categories/nouveau">
                <PlusCircle className="mr-2 h-4 w-4" />
                {t('admin.categories.addCategory')}
              </Link>
            </Button>
          </Can>
        )}
        columns={columns}
        data={categories}
        total={categories.length}
        page={1}
        pageSize={Math.max(categories.length, 1)}
        onPageChange={() => {}}
        onRowClick={canUpdate ? category => navigate(`/admin/categories/${category.id}/modifier`) : undefined}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        emptyLabel={t('admin.categories.empty')}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open)
            setDeleting(null)
        }}
        title={t('admin.categories.deleteConfirm')}
        description={t('admin.categories.deleteWarning')}
        confirmLabel={t('common.delete')}
        onConfirm={() => deleting && deleteCategory(deleting.id)}
        isPending={isDeleting}
        error={deleteError}
        destructive
      />
    </>
  )
}

/** A dead image URL falls back to the placeholder instead of printing its alt text in the cell. */
function CategoryThumbnail({ category }: { category: CategoryRecord }) {
  const [broken, setBroken] = useState(false)

  if (!category.imageUrl || broken) {
    return (
      <span className="bg-muted text-muted-foreground flex h-10 w-10 items-center justify-center rounded-lg">
        <ImageOff className="h-4 w-4" />
      </span>
    )
  }
  return (
    <img
      src={category.imageUrl}
      alt={category.name}
      className="h-10 w-10 rounded-lg object-cover"
      onError={() => setBroken(true)}
    />
  )
}
