import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { RoleItem } from '../utils/roles-queries'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, PlusCircle, Trash2, UserCog } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { ConfirmDialog } from '@/features/admin/common/components/confirm-dialog'
import {
  deleteRoleMutationOptions,
  fetchRolesQueryOptions,
  hasAllRights,
} from '../utils/roles-queries'

export default function RolesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [roleToDelete, setRoleToDelete] = useState<RoleItem | null>(null)

  const { data, isLoading, isError, refetch } = useQuery(fetchRolesQueryOptions())

  const { mutate: deleteRole, isPending: isDeleting } = useMutation({
    ...deleteRoleMutationOptions,
    onSuccess: () => {
      toast.success(t('admin.roles.deleted'))
      setRoleToDelete(null)
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || t('common.error'))
    },
  })

  const columns = useMemo<Array<ColumnDef<RoleItem, unknown>>>(() => [
    {
      id: 'name',
      header: t('admin.roles.columns.name'),
      cell: ({ row }) => (
        <span className="flex items-center gap-2 font-medium">
          {row.original.name}
          {row.original.isSystem && <Badge variant="outline">{t('admin.roles.system')}</Badge>}
        </span>
      ),
    },
    {
      id: 'description',
      header: t('admin.roles.columns.description'),
      meta: { className: 'max-w-xs truncate' },
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.description || '—'}</span>,
    },
    {
      id: 'members',
      header: t('admin.roles.members'),
      meta: { numeric: true },
      cell: ({ row }) => row.original.usersCount,
    },
    {
      id: 'permissions',
      header: t('admin.roles.columns.permissions'),
      cell: ({ row }) => (
        <Badge variant="secondary">
          {hasAllRights(row.original)
            ? t('admin.roles.allRights')
            : t('admin.roles.permissionsCount', { count: row.original.permissions.length })}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      // System roles are defined in code: nothing to edit or delete here.
      cell: ({ row }) => {
        if (row.original.isSystem)
          return null
        const deleteBlocked = row.original.usersCount > 0
        return (
          <div className="flex justify-end gap-1">
            <Button size="icon" variant="ghost" asChild aria-label={t('common.edit')}>
              <Link to={`/admin/roles/${row.original.id}/modifier`}>
                <Pencil className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              disabled={deleteBlocked}
              title={deleteBlocked ? t('admin.roles.deleteBlocked') : undefined}
              aria-label={deleteBlocked ? t('admin.roles.deleteBlocked') : t('common.delete')}
              onClick={() => setRoleToDelete(row.original)}
            >
              <Trash2 className="text-destructive h-4 w-4" />
            </Button>
          </div>
        )
      },
    },
  ], [t])

  const roles = data?.roles ?? []

  return (
    <>
      <AdminListShell
        title={t('admin.roles.title')}
        description={t('admin.roles.description')}
        actions={(
          <>
            <Button variant="outline" asChild>
              <Link to="/admin/equipe">
                <UserCog className="mr-2 h-4 w-4" />
                {t('admin.roles.manageTeam')}
              </Link>
            </Button>
            <Button asChild>
              <Link to="/admin/roles/nouveau">
                <PlusCircle className="mr-2 h-4 w-4" />
                {t('admin.roles.addRole')}
              </Link>
            </Button>
          </>
        )}
        columns={columns}
        data={roles}
        total={roles.length}
        page={1}
        pageSize={Math.max(roles.length, 1)}
        onPageChange={() => {}}
        onRowClick={role => !role.isSystem && navigate(`/admin/roles/${role.id}/modifier`)}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        emptyLabel={t('admin.roles.empty')}
      />

      <ConfirmDialog
        open={roleToDelete !== null}
        onOpenChange={(open) => {
          if (!open)
            setRoleToDelete(null)
        }}
        title={t('admin.roles.deleteTitle')}
        description={t('admin.roles.deleteConfirm', { name: roleToDelete?.name ?? '' })}
        confirmLabel={t('common.delete')}
        onConfirm={() => roleToDelete && deleteRole(roleToDelete.id)}
        isPending={isDeleting}
        destructive
      />
    </>
  )
}
