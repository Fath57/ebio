import type { BannerOffers, DeliveryPricingConfig } from '@boilerstone/openapi-generator/client/types.gen'
import type { CommissionCategoryRate } from '../forms/commission-form'
import { client } from '@boilerstone/openapi-generator'
import {
  adminAssistantControllerGet,
  adminAssistantControllerUpdate,
  adminBannerOffersControllerGet,
  adminBannerOffersControllerUpdate,
  adminControllerUpdateCashOnDeliveryLimit,
  adminControllerUpdateCommissions,
  adminControllerUpdateCourierDebtLimit,
  adminControllerUpdateDeliveryCommission,
  adminDeliveryPricingControllerGet,
  adminDeliveryPricingControllerUpdate,
} from '@boilerstone/openapi-generator/client/sdk.gen'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@boilerstone/ui/components/primitives/tabs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, CreditCard, Percent } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Can } from '@/lib/casl/can'
import { PaymentMethodsManager } from '../components/payment-methods-manager'
import { AssistantToggle } from '../forms/assistant-toggle'
import { BannerOffersForm } from '../forms/banner-offers-form'
import { CashLimitForm } from '../forms/cash-limit-form'
import { CommissionForm } from '../forms/commission-form'
import { DeliveryCommissionForm } from '../forms/delivery-commission-form'
import { DeliveryPricingForm } from '../forms/delivery-pricing-form'

interface AdminSettingsData {
  commissions: CommissionCategoryRate[]
  /** eBio's share of the delivery fee as a fraction (0.10 = 10 %). */
  deliveryCommissionRate: number
  /** Maximum order total payable in cash on delivery, in FCFA (0 = disabled). */
  cashOnDeliveryMaxAmount: number
  /** Deepest negative courier balance before runs are suspended (0 = no limit). */
  courierMaxDebt: number
}

function fetchDeliveryPricingQueryOptions() {
  return {
    queryKey: ['admin', 'delivery-pricing'],
    queryFn: async () => {
      const response = await adminDeliveryPricingControllerGet()
      if (response.error)
        throw new Error('Failed to fetch delivery pricing')
      return response.data as DeliveryPricingConfig
    },
  }
}

function fetchBannerOffersQueryOptions() {
  return {
    queryKey: ['admin', 'banner-offers'],
    queryFn: async () => {
      const response = await adminBannerOffersControllerGet()
      if (response.error)
        throw new Error('Failed to fetch banner offers')
      return response.data as BannerOffers
    },
  }
}

function fetchAssistantQueryOptions() {
  return {
    queryKey: ['admin', 'assistant'],
    queryFn: async () => {
      const response = await adminAssistantControllerGet()
      if (response.error)
        throw new Error('Failed to fetch assistant setting')
      return response.data as { enabled: boolean }
    },
  }
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
  const [deliveryFeedback, setDeliveryFeedback] = useState<'saved' | 'error' | null>(null)
  const [cashLimitFeedback, setCashLimitFeedback] = useState<'saved' | 'error' | null>(null)
  const [debtLimitFeedback, setDebtLimitFeedback] = useState<'saved' | 'error' | null>(null)
  const [pricingFeedback, setPricingFeedback] = useState<'saved' | 'error' | null>(null)
  const [bannerOffersFeedback, setBannerOffersFeedback] = useState<'saved' | 'error' | null>(null)
  const [assistantFeedback, setAssistantFeedback] = useState<'saved' | 'error' | null>(null)

  const { data: settings, isLoading } = useQuery(fetchAdminSettingsQueryOptions())
  const { data: deliveryPricing, isLoading: isPricingLoading } = useQuery(fetchDeliveryPricingQueryOptions())
  const { data: bannerOffers, isLoading: isBannerOffersLoading } = useQuery(fetchBannerOffersQueryOptions())
  const { data: assistant, isLoading: isAssistantLoading } = useQuery(fetchAssistantQueryOptions())

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

  const { mutate: updateDeliveryCommission, isPending: isDeliveryPending } = useMutation({
    mutationFn: async (rate: number) => {
      const response = await adminControllerUpdateDeliveryCommission({ body: { rate } })
      if (response.error)
        throw new Error('Failed to update delivery commission')
      return response.data
    },
    onMutate: () => {
      setDeliveryFeedback(null)
    },
    onSuccess: () => {
      setDeliveryFeedback('saved')
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] })
    },
    onError: () => {
      setDeliveryFeedback('error')
    },
  })

  const { mutate: updateCashLimit, isPending: isCashLimitPending } = useMutation({
    mutationFn: async (amount: number) => {
      const response = await adminControllerUpdateCashOnDeliveryLimit({ body: { amount } })
      if (response.error)
        throw new Error('Failed to update cash on delivery limit')
      return response.data
    },
    onMutate: () => {
      setCashLimitFeedback(null)
    },
    onSuccess: () => {
      setCashLimitFeedback('saved')
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] })
    },
    onError: () => {
      setCashLimitFeedback('error')
    },
  })

  const { mutate: updateDebtLimit, isPending: isDebtLimitPending } = useMutation({
    mutationFn: async (amount: number) => {
      const response = await adminControllerUpdateCourierDebtLimit({ body: { amount } })
      if (response.error)
        throw new Error('Failed to update courier debt limit')
      return response.data
    },
    onMutate: () => {
      setDebtLimitFeedback(null)
    },
    onSuccess: () => {
      setDebtLimitFeedback('saved')
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] })
    },
    onError: () => {
      setDebtLimitFeedback('error')
    },
  })

  const { mutate: updateDeliveryPricing, isPending: isPricingPending } = useMutation({
    mutationFn: async (config: DeliveryPricingConfig) => {
      const response = await adminDeliveryPricingControllerUpdate({ body: config })
      if (response.error)
        throw new Error('Failed to update delivery pricing')
      return response.data as DeliveryPricingConfig
    },
    onMutate: () => {
      setPricingFeedback(null)
    },
    onSuccess: (saved) => {
      setPricingFeedback('saved')
      queryClient.setQueryData(['admin', 'delivery-pricing'], saved)
    },
    onError: () => {
      setPricingFeedback('error')
    },
  })

  const { mutate: updateBannerOffers, isPending: isBannerOffersPending } = useMutation({
    mutationFn: async (offers: BannerOffers) => {
      const response = await adminBannerOffersControllerUpdate({ body: offers })
      if (response.error)
        throw new Error('Failed to update banner offers')
      return response.data as BannerOffers
    },
    onMutate: () => {
      setBannerOffersFeedback(null)
    },
    onSuccess: (saved) => {
      setBannerOffersFeedback('saved')
      queryClient.setQueryData(['admin', 'banner-offers'], saved)
    },
    onError: () => {
      setBannerOffersFeedback('error')
    },
  })

  const { mutate: updateAssistant, isPending: isAssistantPending } = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await adminAssistantControllerUpdate({ body: { enabled } })
      if (response.error)
        throw new Error('Failed to update assistant setting')
      return response.data as { enabled: boolean }
    },
    onMutate: () => {
      setAssistantFeedback(null)
    },
    onSuccess: (saved) => {
      setAssistantFeedback('saved')
      queryClient.setQueryData(['admin', 'assistant'], saved)
    },
    onError: () => {
      setAssistantFeedback('error')
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
          <TabsTrigger value="assistant">
            <Bot className="mr-2 h-4 w-4" />
            {t('admin.settings.tabs.assistant')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assistant" className="mt-6 space-y-6">
          <Can action="manage" subject="all">
            <Card>
              <CardHeader>
                <CardTitle>{t('admin.settings.assistant.title')}</CardTitle>
                <p className="text-muted-foreground text-sm">{t('admin.settings.assistant.description')}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {isAssistantLoading || !assistant
                  ? <Skeleton className="h-12 w-full" />
                  : (
                      <AssistantToggle
                        enabled={assistant.enabled}
                        onChange={updateAssistant}
                        isPending={isAssistantPending}
                      />
                    )}
                {assistantFeedback === 'saved' && (
                  <p className="text-sm text-green-600">{t('admin.settings.assistant.saved')}</p>
                )}
                {assistantFeedback === 'error' && (
                  <p className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
                    {t('admin.settings.assistant.error')}
                  </p>
                )}
              </CardContent>
            </Card>
          </Can>
        </TabsContent>

        <TabsContent value="commissions" className="mt-6 space-y-6">
          <Can action="manage" subject="all">
            <Card>
              <CardHeader>
                <CardTitle>{t('admin.settings.deliveryPricing.title')}</CardTitle>
                <p className="text-muted-foreground text-sm">{t('admin.settings.deliveryPricing.description')}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {isPricingLoading || !deliveryPricing
                  ? <Skeleton className="h-40 w-full" />
                  : (
                      <DeliveryPricingForm
                        config={deliveryPricing}
                        onSubmit={updateDeliveryPricing}
                        isPending={isPricingPending}
                      />
                    )}
                {pricingFeedback === 'saved' && (
                  <p className="text-sm text-green-600">{t('admin.settings.deliveryPricing.saved')}</p>
                )}
                {pricingFeedback === 'error' && (
                  <p className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
                    {t('admin.settings.deliveryPricing.error')}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('admin.settings.bannerOffers.title')}</CardTitle>
                <p className="text-muted-foreground text-sm">{t('admin.settings.bannerOffers.description')}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {isBannerOffersLoading || !bannerOffers
                  ? <Skeleton className="h-40 w-full" />
                  : (
                      <BannerOffersForm
                        offers={bannerOffers}
                        onSubmit={updateBannerOffers}
                        isPending={isBannerOffersPending}
                      />
                    )}
                {bannerOffersFeedback === 'saved' && (
                  <p className="text-sm text-green-600">{t('admin.settings.bannerOffers.saved')}</p>
                )}
                {bannerOffersFeedback === 'error' && (
                  <p className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
                    {t('admin.settings.bannerOffers.error')}
                  </p>
                )}
              </CardContent>
            </Card>
          </Can>

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

            <Card>
              <CardHeader>
                <CardTitle>{t('admin.settings.deliveryCommission.title')}</CardTitle>
                <p className="text-muted-foreground text-sm">{t('admin.settings.deliveryCommission.description')}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <DeliveryCommissionForm
                  rate={settings?.deliveryCommissionRate ?? 0.1}
                  onSubmit={updateDeliveryCommission}
                  isPending={isDeliveryPending}
                />
                {deliveryFeedback === 'saved' && (
                  <p className="text-sm text-green-600">{t('admin.settings.deliveryCommission.saved')}</p>
                )}
                {deliveryFeedback === 'error' && (
                  <p className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
                    {t('admin.settings.deliveryCommission.error')}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('admin.settings.cashLimit.title')}</CardTitle>
                <p className="text-muted-foreground text-sm">{t('admin.settings.cashLimit.description')}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <CashLimitForm
                  amount={settings?.cashOnDeliveryMaxAmount ?? 25000}
                  onSubmit={updateCashLimit}
                  isPending={isCashLimitPending}
                />
                {cashLimitFeedback === 'saved' && (
                  <p className="text-sm text-green-600">{t('admin.settings.cashLimit.saved')}</p>
                )}
                {cashLimitFeedback === 'error' && (
                  <p className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
                    {t('admin.settings.cashLimit.error')}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('admin.settings.debtLimit.title')}</CardTitle>
                <p className="text-muted-foreground text-sm">{t('admin.settings.debtLimit.description')}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <CashLimitForm
                  amount={settings?.courierMaxDebt ?? 5000}
                  onSubmit={updateDebtLimit}
                  isPending={isDebtLimitPending}
                  i18nPrefix="admin.settings.debtLimit"
                  fieldId="courier-debt-limit-amount"
                />
                {debtLimitFeedback === 'saved' && (
                  <p className="text-sm text-green-600">{t('admin.settings.debtLimit.saved')}</p>
                )}
                {debtLimitFeedback === 'error' && (
                  <p className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
                    {t('admin.settings.debtLimit.error')}
                  </p>
                )}
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
