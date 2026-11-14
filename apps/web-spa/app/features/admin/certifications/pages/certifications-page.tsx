import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { Certification } from '../utils/certifications-queries'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Award, Pencil, PlusCircle, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { ConfirmDialog } from '@/features/admin/common/components/confirm-dialog'
import { StatusBadge } from '@/features/admin/common/components/status-badge'
import { Can } from '@/lib/casl/can'
import { deleteCertificationMutationOptions, fetchCertificationsQueryOptions } from '../utils/certifications-queries'

/**
 * The labels and certifications shops can put on their products. Managed
 * here so a new one (a local cooperative label, a new certifier) is an
 * admin's task, not a release.
 */
export default function CertificationsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deleting, setDeleting] = useState<Certification | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data, isLoading, isError, refetch } = useQuery(fetchCertificationsQueryOptions())

  const { mutate: remove, isPending: isDeleting } = useMutation({
    ...deleteCertificationMutationOptions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'certifications'] })
      queryClient.invalidateQueries({ queryKey: ['certifications', 'active'] })
      setDeleting(null)
    },
    // A label still worn is refused by the API; the reason belongs on screen.
    onError: (error: Error) => setDeleteError(error.message),
  })

  const columns = useMemo<Array<ColumnDef<Certification, unknown>>>(() => [
    {
      id: 'name',
      header: t('admin.certifications.columns.name'),
      meta: { wrap: true },
      cell: ({ row }) => (
        <span className="flex items-center gap-3">
          {row.original.logoUrl
            ? <img src={row.original.logoUrl} alt="" className="h-10 w-10 rounded-lg bg-white object-contain p-1" />
            : (
                <span className="bg-muted text-muted-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                  <Award className="h-4 w-4" />
                </span>
              )}
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">{row.original.name}</span>
            <span className="text-muted-foreground font-mono text-xs">{row.original.code}</span>
          </span>
        </span>
      ),
    },
    {
      id: 'description',
      header: t('admin.certifications.columns.description'),
      meta: { wrap: true, hideBelow: 'lg' },
      cell: ({ row }) => <span className="text-muted-foreground line-clamp-2">{row.original.description || '-'}</span>,
    },
    {
      id: 'productCount',
      header: t('admin.certifications.columns.products'),
      meta: { numeric: true },
      cell: ({ row }) => row.original.productCount,
    },
    {
      id: 'status',
      header: t('admin.certifications.columns.status'),
      cell: ({ row }) => (
        <StatusBadge tone={row.original.isActive ? 'done' : 'idle'}>
          {row.original.isActive ? t('admin.certifications.active') : t('admin.certifications.inactive')}
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
            <Can action="manage" subject="Certification">
              <Button size="icon" variant="ghost" asChild aria-label={t('common.edit')}>
                <Link to={`/admin/certifications/${row.original.id}/modifier`}>
                  <Pencil className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="icon"
                variant="ghost"
                disabled={isDeleting || inUse}
                title={inUse ? t('admin.certifications.deleteBlocked') : undefined}
                aria-label={inUse ? t('admin.certifications.deleteBlocked') : t('common.delete')}
                onClick={() => {
                  setDeleteError(null)
                  setDeleting(row.original)
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

  const items = data?.items ?? []

  return (
    <>
      <AdminListShell
        title={t('admin.certifications.title')}
        description={t('admin.certifications.description')}
        actions={(
          <Can action="manage" subject="Certification">
            <Button asChild>
              <Link to="/admin/certifications/nouveau">
                <PlusCircle className="mr-2 h-4 w-4" />
                {t('admin.certifications.add')}
              </Link>
            </Button>
          </Can>
        )}
        columns={columns}
        data={items}
        total={items.length}
        page={1}
        pageSize={Math.max(items.length, 1)}
        onPageChange={() => {}}
        onRowClick={certification => navigate(`/admin/certifications/${certification.id}/modifier`)}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        emptyLabel={t('admin.certifications.empty')}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open)
            setDeleting(null)
        }}
        title={t('admin.certifications.deleteTitle')}
        description={t('admin.certifications.deleteWarning')}
        confirmLabel={t('common.delete')}
        onConfirm={() => deleting && remove(deleting.id)}
        isPending={isDeleting}
        error={deleteError}
        destructive
      />
    </>
  )
}
