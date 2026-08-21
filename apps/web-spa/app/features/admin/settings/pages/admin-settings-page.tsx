import type { CommissionCategoryRate } from '../forms/commission-form'
import { client } from '@boilerstone/openapi-generator'
import { adminControllerUpdateCommissions } from '@boilerstone/openapi-generator/client/sdk.gen'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Can } from '@/lib/casl/can'
import { CommissionForm } from '../forms/commission-form'

interface AdminSettingsData {
  commissions: CommissionCategoryRate[]
}

function fetchAdminSettingsQueryOptions() {
  return {
    queryKey: ['admin', 'settings'],
    queryFn: async () => {
      // No dedicated SDK function for GET /api/admin/settings — fallback to client
      const result = await client.get({ url: '/api/admin/settings' })
      return result.data as AdminSettingsData
    },
  }
}

export default function AdminSettingsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data: settings, isLoading } = useQuery(fetchAdminSettingsQueryOptions())

  const { mutate: updateCommissions, isPending } = useMutation({
    mutationFn: async (rates: Array<{ category: string, rate: number }>) => {
      const response = await adminControllerUpdateCommissions({ body: { rates } })
      if (response.error)
        throw new Error('Failed to update commissions')
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'commissions'] })
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold">{t('admin.settings.title')}</h2>
        <p className="text-muted-foreground">{t('admin.settings.description')}</p>
      </div>

      <Can action="manage" subject="all">
        <Card>
          <CardHeader>
            <CardTitle>{t('admin.settings.commission.title')}</CardTitle>
            <p className="text-muted-foreground text-sm">{t('admin.settings.commission.description')}</p>
          </CardHeader>
          <CardContent>
            <CommissionForm
              categories={settings?.commissions ?? []}
              onSubmit={updateCommissions}
              isPending={isPending}
            />
          </CardContent>
        </Card>
      </Can>
    </div>
  )
}
