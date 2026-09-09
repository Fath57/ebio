import type { RoleFormData } from '../forms/role-form'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { RoleForm } from '../forms/role-form'
import { fetchRoleByIdQueryOptions, updateRoleMutationOptions } from '../utils/roles-queries'

export default function RoleEditPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { roleId } = useParams()

  const { data: role, isLoading } = useQuery(fetchRoleByIdQueryOptions(roleId!))

  const { mutate, isPending } = useMutation({
    ...updateRoleMutationOptions,
    onSuccess: () => {
      toast.success(t('admin.roles.updated'))
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] })
      navigate('/admin/roles')
    },
    onError: (error: Error) => {
      toast.error(error.message || t('common.error'))
    },
  })

  function handleSubmit(data: RoleFormData) {
    mutate({
      id: roleId!,
      name: data.name,
      description: data.description?.trim() ?? '',
      permissionIds: data.permissionIds,
    })
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!role) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/roles')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('common.back')}
        </Button>
        <p className="text-muted-foreground">{t('admin.roles.notFound')}</p>
      </div>
    )
  }

  const initialData = {
    name: role.name,
    description: role.description ?? '',
    permissionIds: role.permissions.map(p => p.id),
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/roles')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('common.back')}
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {role.isSystem ? t('admin.roles.viewRole') : t('admin.roles.editRole')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {role.isSystem ? t('admin.roles.systemNotice') : t('admin.roles.editRoleDescription')}
          </p>
        </div>
      </div>
      <Card className="p-6">
        <RoleForm
          key={role.id}
          onSubmit={handleSubmit}
          isPending={isPending}
          initialData={initialData}
          readOnly={role.isSystem}
        />
      </Card>
    </div>
  )
}
