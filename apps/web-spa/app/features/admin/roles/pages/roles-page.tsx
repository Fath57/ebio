import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
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
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { Can } from '@/lib/casl/can'
import {
  deleteRoleMutationOptions,
  fetchRolesQueryOptions,
} from '../utils/roles-queries'

export default function RolesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: roles, isLoading } = useQuery(fetchRolesQueryOptions())

  const { mutate: deleteRole, isPending: isDeleting } = useMutation({
    ...deleteRoleMutationOptions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] })
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('admin.roles.title')}</h2>
          <p className="text-muted-foreground">{t('admin.roles.description')}</p>
        </div>
        <Can action="manage" subject="all">
          <Button asChild>
            <Link to="/admin/roles/nouveau">
              <PlusCircle className="mr-2 h-4 w-4" />
              {t('admin.roles.addRole')}
            </Link>
          </Button>
        </Can>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('admin.roles.columns.name')}</TableHead>
            <TableHead>{t('admin.roles.columns.description')}</TableHead>
            <TableHead>{t('admin.roles.columns.permissions')}</TableHead>
            <TableHead>{t('admin.roles.columns.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles?.data?.map(role => (
            <TableRow key={role.id}>
              <TableCell className="font-medium">{role.name}</TableCell>
              <TableCell className="text-muted-foreground">{role.description || '-'}</TableCell>
              <TableCell>
                <Badge variant="secondary">
                  {role.permissionIds?.length ?? 0}
                  {' '}
                  {t('admin.roles.permissionsCount')}
                </Badge>
              </TableCell>
              <TableCell>
                <Can action="manage" subject="all">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/admin/roles/${role.id}/modifier`)}
                    >
                      {t('common.edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteRole(role.id)}
                      disabled={isDeleting}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </Can>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
