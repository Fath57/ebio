import type { ProductUnit } from '../utils/product-units-queries'
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
  deleteProductUnitMutationOptions,
  fetchProductUnitsQueryOptions,
} from '../utils/product-units-queries'

export default function ProductUnitsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deletingUnit, setDeletingUnit] = useState<ProductUnit | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data, isLoading } = useQuery(fetchProductUnitsQueryOptions())

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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const units = data?.items ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('admin.productUnits.title')}</h2>
          <p className="text-muted-foreground">{t('admin.productUnits.description')}</p>
        </div>
        <Can action="create" subject="ProductUnit">
          <Button asChild>
            <Link to="/admin/unites/nouveau">
              <PlusCircle className="mr-2 h-4 w-4" />
              {t('admin.productUnits.addUnit')}
            </Link>
          </Button>
        </Can>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('admin.productUnits.columns.label')}</TableHead>
            <TableHead>{t('admin.productUnits.columns.shortLabel')}</TableHead>
            <TableHead>{t('admin.productUnits.columns.code')}</TableHead>
            <TableHead>{t('admin.productUnits.columns.sortOrder')}</TableHead>
            <TableHead>{t('admin.productUnits.columns.productCount')}</TableHead>
            <TableHead>{t('admin.productUnits.columns.status')}</TableHead>
            <TableHead>{t('admin.productUnits.columns.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {units.map((unit: ProductUnit) => (
            <TableRow key={unit.id}>
              <TableCell className="font-medium">{unit.label}</TableCell>
              <TableCell className="text-muted-foreground">{unit.shortLabel}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{unit.code}</TableCell>
              <TableCell>{unit.sortOrder}</TableCell>
              <TableCell>
                <Badge variant="secondary">{unit.productCount}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={unit.isActive ? 'default' : 'outline'}>
                  {unit.isActive
                    ? t('admin.productUnits.active')
                    : t('admin.productUnits.inactive')}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Can action="update" subject="ProductUnit">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/admin/unites/${unit.id}/modifier`)}
                    >
                      {t('common.edit')}
                    </Button>
                  </Can>
                  <Can action="delete" subject="ProductUnit">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isDeleting || unit.productCount > 0}
                      title={unit.productCount > 0 ? t('admin.productUnits.deleteBlocked') : undefined}
                      onClick={() => {
                        setDeleteError(null)
                        setDeletingUnit(unit)
                      }}
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

      <AlertDialog
        open={!!deletingUnit}
        onOpenChange={open => !open && setDeletingUnit(null)}
      >
        <AlertDialogContent>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">{t('admin.productUnits.deleteConfirm')}</h3>
              <p className="text-sm text-muted-foreground">{t('admin.productUnits.deleteWarning')}</p>
              {deleteError && <p className="mt-2 text-sm text-destructive">{deleteError}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeletingUnit(null)}>{t('common.cancel')}</Button>
              <Button
                variant="destructive"
                disabled={isDeleting}
                onClick={() => deletingUnit && deleteUnit(deletingUnit.id)}
              >
                {t('common.confirm')}
              </Button>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
