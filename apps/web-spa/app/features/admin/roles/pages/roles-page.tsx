import type { RoleItem } from '../utils/roles-queries'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@boilerstone/ui/components/primitives/dialog'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@boilerstone/ui/components/primitives/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, PlusCircle, Trash2, UserCog } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import {
  deleteRoleMutationOptions,
  fetchRolesQueryOptions,
  hasAllRights,
} from '../utils/roles-queries'

export default function RolesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [roleToDelete, setRoleToDelete] = useState<RoleItem | null>(null)

  const { data, isLoading } = useQuery(fetchRolesQueryOptions())

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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const roles = data?.roles ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('admin.roles.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('admin.roles.description')}</p>
        </div>
        <div className="flex gap-2">
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
        </div>
      </div>

      {roles.length === 0
        ? (
            <p className="text-muted-foreground">{t('admin.roles.empty')}</p>
          )
        : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.roles.columns.name')}</TableHead>
                  <TableHead>{t('admin.roles.columns.description')}</TableHead>
                  <TableHead>{t('admin.roles.members')}</TableHead>
                  <TableHead>{t('admin.roles.columns.permissions')}</TableHead>
                  <TableHead className="text-right">{t('admin.roles.columns.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => {
                  const deleteBlocked = role.usersCount > 0
                  return (
                    <TableRow key={role.id}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          {role.name}
                          {role.isSystem && <Badge variant="outline">{t('admin.roles.system')}</Badge>}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">
                        {role.description || '—'}
                      </TableCell>
                      <TableCell>{role.usersCount}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {hasAllRights(role)
                            ? t('admin.roles.allRights')
                            : t('admin.roles.permissionsCount', { count: role.permissions.length })}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {!role.isSystem && (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" asChild>
                              <Link to={`/admin/roles/${role.id}/modifier`}>
                                <Pencil className="mr-1 h-4 w-4" />
                                {t('common.edit')}
                              </Link>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={deleteBlocked}
                              title={deleteBlocked ? t('admin.roles.deleteBlocked') : t('common.delete')}
                              aria-label={t('common.delete')}
                              onClick={() => setRoleToDelete(role)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}

      <Dialog
        open={roleToDelete !== null}
        onOpenChange={(open) => {
          if (!open)
            setRoleToDelete(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.roles.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('admin.roles.deleteConfirm', { name: roleToDelete?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleToDelete(null)} disabled={isDeleting}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={isDeleting || !roleToDelete}
              onClick={() => {
                if (roleToDelete)
                  deleteRole(roleToDelete.id)
              }}
            >
              {isDeleting ? t('common.saving') : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
