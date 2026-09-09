import type { RoleFormData } from '../forms/role-form'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card } from '@boilerstone/ui/components/primitives/card'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { RoleForm } from '../forms/role-form'
import { createRoleMutationOptions } from '../utils/roles-queries'

export default function RoleCreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { mutate, isPending } = useMutation({
    ...createRoleMutationOptions,
    onSuccess: () => {
      toast.success(t('admin.roles.created'))
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] })
      navigate('/admin/roles')
    },
    onError: (error: Error) => {
      toast.error(error.message || t('common.error'))
    },
  })

  function handleSubmit(data: RoleFormData) {
    mutate({
      name: data.name,
      description: data.description?.trim() || undefined,
      permissionIds: data.permissionIds,
    })
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/roles')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('common.back')}
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{t('admin.roles.addRole')}</h1>
          <p className="text-sm text-muted-foreground">{t('admin.roles.addRoleDescription')}</p>
        </div>
      </div>
      <Card className="p-6">
        <RoleForm onSubmit={handleSubmit} isPending={isPending} />
      </Card>
    </div>
  )
}
