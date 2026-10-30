import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { ProductUnit } from '../utils/product-units-queries'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, PlusCircle, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { ConfirmDialog } from '@/features/admin/common/components/confirm-dialog'
import { StatusBadge } from '@/features/admin/common/components/status-badge'
import { useAbility } from '@/lib/casl/ability-context'
import { Can } from '@/lib/casl/can'
import {
  deleteProductUnitMutationOptions,
  fetchProductUnitsQueryOptions,
} from '../utils/product-units-queries'

export default function ProductUnitsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { ability } = useAbility()
  const canUpdate = ability?.can('update', 'ProductUnit') ?? false
  const [deletingUnit, setDeletingUnit] = useState<ProductUnit | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data, isLoading, isError, refetch } = useQuery(fetchProductUnitsQueryOptions())

  const { mutate: deleteUnit, isPending: isDeleting } = useMutation({
    ...deleteProductUnitMutationOptions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'product-units'] })
      queryClient.invalidateQueries({ queryKey: ['product-units', 'active'] })
      setDeletingUnit(null)
      setDeleteError(null)
    },
    // A unit still in use is refused by the API; the reason belongs on screen.
    onError: (error: Error) => setDeleteError(error.message),
  })

  const columns = useMemo<Array<ColumnDef<ProductUnit, unknown>>>(() => [
    {
      id: 'label',
      header: t('admin.productUnits.columns.label'),
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="font-medium">{row.original.label}</span>
          <span className="text-muted-foreground font-mono text-xs">{row.original.code}</span>
        </span>
      ),
    },
    {
      id: 'shortLabel',
      header: t('admin.productUnits.columns.shortLabel'),
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.shortLabel}</span>,
    },
    {
      id: 'sortOrder',
      header: t('admin.productUnits.columns.sortOrder'),
      meta: { numeric: true },
      cell: ({ row }) => row.original.sortOrder,
    },
    {
      id: 'productCount',
      header: t('admin.productUnits.columns.productCount'),
      meta: { numeric: true },
      cell: ({ row }) => row.original.productCount,
    },
    {
      id: 'status',
      header: t('admin.productUnits.columns.status'),
      cell: ({ row }) => (
        <StatusBadge tone={row.original.isActive ? 'done' : 'idle'}>
          {row.original.isActive ? t('admin.productUnits.active') : t('admin.productUnits.inactive')}
        </StatusBadge>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => {
        const inUse = row.original.productCount > 0
        return (
          <div className="flex justify-end gap-1">
            <Can action="update" subject="ProductUnit">
              <Button size="icon" variant="ghost" asChild aria-label={t('common.edit')}>
                <Link to={`/admin/unites/${row.original.id}/modifier`}>
                  <Pencil className="h-4 w-4" />
                </Link>
              </Button>
            </Can>
            <Can action="delete" subject="ProductUnit">
              <Button
                size="icon"
                variant="ghost"
                aria-label={inUse ? t('admin.productUnits.deleteBlocked') : t('common.delete')}
                title={inUse ? t('admin.productUnits.deleteBlocked') : undefined}
                disabled={isDeleting || inUse}
                onClick={() => {
                  setDeleteError(null)
                  setDeletingUnit(row.original)
                }}
              >
                <Trash2 className="text-destructive h-4 w-4" />
              </Button>
            </Can>
          </div>
        )
      },
    },
  ], [t, isDeleting])

  const units = data?.items ?? []

  return (
    <>
      <AdminListShell
        title={t('admin.productUnits.title')}
        description={t('admin.productUnits.description')}
        actions={(
          <Can action="create" subject="ProductUnit">
            <Button asChild>
              <Link to="/admin/unites/nouveau">
                <PlusCircle className="mr-2 h-4 w-4" />
                {t('admin.productUnits.addUnit')}
              </Link>
            </Button>
          </Can>
        )}
        columns={columns}
        data={units}
        total={units.length}
        page={1}
        pageSize={Math.max(units.length, 1)}
        onPageChange={() => {}}
        onRowClick={canUpdate ? unit => navigate(`/admin/unites/${unit.id}/modifier`) : undefined}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        emptyLabel={t('admin.productUnits.empty')}
      />

      <ConfirmDialog
        open={deletingUnit !== null}
        onOpenChange={(open) => {
          if (!open)
            setDeletingUnit(null)
        }}
        title={t('admin.productUnits.deleteConfirm')}
        description={t('admin.productUnits.deleteWarning')}
        confirmLabel={t('common.delete')}
        onConfirm={() => deletingUnit && deleteUnit(deletingUnit.id)}
        isPending={isDeleting}
        error={deleteError}
        destructive
      />
    </>
  )
}
