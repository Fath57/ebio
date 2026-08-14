import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { Banner } from '../utils/banners-queries'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { DataTable } from '@boilerstone/ui/components/primitives/data-table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { deleteBanner, fetchBannersQueryOptions, updateBanner } from '../utils/banners-queries'

export default function BannersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery(fetchBannersQueryOptions())

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'banners'] })

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string, isActive: boolean }) =>
      updateBanner(id, { isActive }),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: deleteBanner,
    onSuccess: invalidate,
  })

  const columns = useMemo<Array<ColumnDef<Banner, unknown>>>(() => [
    {
      id: 'position',
      header: t('admin.banners.columns.position'),
      enableSorting: false,
      meta: { align: 'right' },
      cell: ({ row }) => row.original.position,
    },
    {
      id: 'preview',
      header: t('admin.banners.columns.preview'),
      enableSorting: false,
      cell: ({ row }) => (
        <img
          src={row.original.imageUrl}
          alt=""
          className="h-10 w-20 rounded object-cover"
        />
      ),
    },
    {
      id: 'title',
      header: t('admin.banners.columns.title'),
      enableSorting: false,
      cell: ({ row }) => (
        <>
          <div className="font-medium">{row.original.title}</div>
          <div className="text-muted-foreground text-xs">{row.original.subtitle ?? '—'}</div>
        </>
      ),
    },
    {
      id: 'target',
      header: t('admin.banners.columns.target'),
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {t(`admin.banners.targetType.${row.original.targetType}`)}
          </Badge>
          {/* Cible supprimée : la bannière est ignorée côté mobile. */}
          {row.original.targetLabel
            ? <span>{row.original.targetLabel}</span>
            : <Badge variant="destructive">{t('admin.banners.brokenTarget')}</Badge>}
        </div>
      ),
    },
    {
      id: 'isActive',
      header: t('admin.banners.columns.status'),
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          variant={row.original.isActive ? 'default' : 'outline'}
          size="sm"
          disabled={toggle.isPending}
          onClick={() => toggle.mutate({ id: row.original.id, isActive: !row.original.isActive })}
        >
          {row.original.isActive ? t('admin.banners.active') : t('admin.banners.inactive')}
        </Button>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { align: 'right' },
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/admin/bannieres/${row.original.id}/modifier`)}
            aria-label={t('common.edit')}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={remove.isPending}
            onClick={() => remove.mutate(row.original.id)}
            aria-label={t('common.delete')}
          >
            <Trash2 className="text-destructive h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ], [t, navigate, toggle, remove])

  const items = data?.items ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('admin.banners.title')}</h2>
          <p className="text-muted-foreground">{t('admin.banners.description')}</p>
        </div>
        <Button onClick={() => navigate('/admin/bannieres/nouvelle')}>
          <Plus className="mr-2 h-4 w-4" />
          {t('admin.banners.add')}
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={items}
        total={data?.total ?? 0}
        page={1}
        pageSize={Math.max(items.length, 1)}
        onPageChange={() => {}}
        sorting={[]}
        onSortingChange={() => {}}
        isLoading={isLoading}
        labels={{
          empty: t('admin.banners.empty'),
          resultCount: count => t('dataTable.resultCount', { count }),
          pageOf: (page, lastPage) => t('dataTable.pageOf', { page, lastPage }),
          previous: t('dataTable.previous'),
          next: t('dataTable.next'),
        }}
      />
    </div>
  )
}
