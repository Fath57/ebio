import type { CommissionCategoryRate } from '../forms/commission-form'
import { client } from '@boilerstone/openapi-generator'
import { adminControllerUpdateCommissions } from '@boilerstone/openapi-generator/client/sdk.gen'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@boilerstone/ui/components/primitives/tabs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CreditCard, Percent } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Can } from '@/lib/casl/can'
import { PaymentMethodsManager } from '../components/payment-methods-manager'
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

/**
 * Every settings group opens with a short explanation of what it drives and
 * where its effects show up: the page has to stay understandable as groups
 * keep being added.
 */
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
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t('admin.settings.title')}</h2>
        <p className="text-muted-foreground">{t('admin.settings.description')}</p>
      </div>

      <Tabs defaultValue="commissions">
        <TabsList>
          <TabsTrigger value="commissions">
            <Percent className="mr-2 h-4 w-4" />
            {t('admin.settings.tabs.commissions')}
          </TabsTrigger>
          <TabsTrigger value="payments">
            <CreditCard className="mr-2 h-4 w-4" />
            {t('admin.settings.tabs.payments')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="commissions" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('admin.settings.commission.howTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-muted-foreground list-disc space-y-2 pl-5 text-sm">
                <li>{t('admin.settings.commission.how1')}</li>
                <li>
                  {t('admin.settings.commission.how2')}
                  {' '}
                  <Link to="/admin/fournisseurs" className="text-primary underline-offset-2 hover:underline">
                    {t('admin.settings.commission.how2Link')}
                  </Link>
                </li>
                <li>{t('admin.settings.commission.how3')}</li>
                <li>
                  {t('admin.settings.commission.how4')}
                  {' '}
                  <Link to="/admin/commissions" className="text-primary underline-offset-2 hover:underline">
                    {t('admin.settings.commission.how4Link')}
                  </Link>
                </li>
              </ul>
            </CardContent>
          </Card>

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
        </TabsContent>

        <TabsContent value="payments" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('admin.settings.paymentMethods.title')}</CardTitle>
              <p className="text-muted-foreground text-sm">{t('admin.settings.paymentMethods.description')}</p>
            </CardHeader>
            <CardContent>
              <PaymentMethodsManager />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
