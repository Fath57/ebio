import type { CommissionFormData } from '../forms/commission-form'
import { client } from '@boilerstone/openapi-generator'
import { adminControllerUpdateCommissions } from '@boilerstone/openapi-generator/client/sdk.gen'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { Separator } from '@boilerstone/ui/components/primitives/separator'
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
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Can } from '@/lib/casl/can'
import { CommissionForm } from '../forms/commission-form'

interface PlanItem {
  id: string
  name: string
  price: number
  features: string[]
}

interface AdminSettingsData {
  commissions: Partial<CommissionFormData>
  plans: PlanItem[]
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
    mutationFn: async (data: CommissionFormData) => {
      const response = await adminControllerUpdateCommissions({
        body: {
          rates: [
            { category: 'miseEnRelation', rate: data.miseEnRelationRate },
            { category: 'commande', rate: data.commandeRate },
            { category: 'premium', rate: data.premiumRate },
          ],
        },
      })
      if (response.error)
        throw new Error('Failed to update commissions')
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] })
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
          </CardHeader>
          <CardContent>
            <CommissionForm
              onSubmit={updateCommissions}
              isPending={isPending}
              initialData={settings?.commissions}
            />
          </CardContent>
        </Card>
      </Can>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.settings.plans.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('admin.settings.plans.name')}</TableHead>
                <TableHead>{t('admin.settings.plans.price')}</TableHead>
                <TableHead>{t('admin.settings.plans.features')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings?.plans?.map(plan => (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium">{plan.name}</TableCell>
                  <TableCell>
                    {plan.price}
                    {' '}
                    {t('admin.settings.currency')}
                    /
                    {t('admin.settings.month')}
                  </TableCell>
                  <TableCell>
                    <ul className="space-y-1">
                      {plan.features?.map((feature, i) => (
                        <li key={i} className="flex items-center gap-1 text-sm">
                          <Check className="h-3 w-3 text-green-600" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
