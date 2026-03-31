import type { RoleFormData } from '../forms/role-form'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
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
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] })
      navigate('/admin/roles')
    },
  })

  function handleSubmit(data: RoleFormData) {
    mutate({
      id: roleId!,
      name: data.name,
      description: data.description ?? '',
      permissionIds: data.permissionIds,
    })
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const initialData = role
    ? {
        name: role.name as string,
        description: role.description as string,
        permissionIds: (role.permissionIds as string[]) ?? [],
      }
    : undefined

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/roles')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('common.back')}
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{t('admin.roles.editRole')}</h2>
          <p className="text-sm text-muted-foreground">{t('admin.roles.editRoleDescription')}</p>
        </div>
      </div>
      <Card className="p-6">
        <RoleForm
          onSubmit={handleSubmit}
          isPending={isPending}
          initialData={initialData}
        />
      </Card>
    </div>
  )
}
