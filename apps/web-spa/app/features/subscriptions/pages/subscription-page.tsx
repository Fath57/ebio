import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@boilerstone/ui/components/primitives/dialog'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Can } from '@/lib/casl/can'
import {
  cancelPlanMutationOptions,
  fetchCurrentPlanQueryOptions,
  fetchPlansQueryOptions,
  upgradePlanMutationOptions,
} from '../utils/subscription-queries'

export default function SubscriptionPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [confirmDialog, setConfirmDialog] = useState<{ type: 'upgrade' | 'cancel', planId?: string } | null>(null)

  const { data: currentPlan, isLoading: isLoadingCurrent } = useQuery(fetchCurrentPlanQueryOptions())
  const { data: plans, isLoading: isLoadingPlans } = useQuery(fetchPlansQueryOptions())

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['subscription'] })
    setConfirmDialog(null)
  }

  const { mutate: upgrade, isPending: isUpgrading } = useMutation({
    ...upgradePlanMutationOptions,
    onSuccess: invalidate,
  })

  const { mutate: cancel, isPending: isCancelling } = useMutation({
    ...cancelPlanMutationOptions,
    onSuccess: invalidate,
  })

  if (isLoadingCurrent || isLoadingPlans) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t('subscriptions.title')}</h2>
        <p className="text-muted-foreground">{t('subscriptions.description')}</p>
      </div>

      {currentPlan && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              {t('subscriptions.currentPlan')}
              <Badge>{currentPlan.name}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>
              <span className="font-medium">
                {t('subscriptions.price')}
                :
                {' '}
              </span>
              {currentPlan.price}
              {' '}
              {t('subscriptions.currency')}
              /
              {t('subscriptions.month')}
            </p>
            <p>
              <span className="font-medium">
                {t('subscriptions.renewalDate')}
                :
                {' '}
              </span>
              {currentPlan.renewalDate ? new Date(currentPlan.renewalDate).toLocaleDateString() : '-'}
            </p>
          </CardContent>
          <CardFooter>
            <Can action="update" subject="Subscription">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmDialog({ type: 'cancel' })}
              >
                {t('subscriptions.cancelPlan')}
              </Button>
            </Can>
          </CardFooter>
        </Card>
      )}

      <div>
        <h3 className="text-lg font-semibold mb-4">{t('subscriptions.availablePlans')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans?.data?.map((plan) => {
            const isCurrent = currentPlan?.planId === plan.id
            return (
              <Card key={plan.id} className={isCurrent ? 'border-primary ring-2 ring-primary' : ''}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {plan.name}
                    {isCurrent && <Badge>{t('subscriptions.current')}</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-3xl font-bold">
                    {plan.price}
                    {' '}
                    {t('subscriptions.currency')}
                    <span className="text-sm font-normal text-muted-foreground">
                      /
                      {t('subscriptions.month')}
                    </span>
                  </p>
                  <ul className="space-y-2">
                    {plan.features?.map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-600" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  {!isCurrent && (
                    <Can action="update" subject="Subscription">
                      <Button
                        className="w-full"
                        onClick={() => setConfirmDialog({ type: 'upgrade', planId: plan.id })}
                      >
                        {t('subscriptions.upgrade')}
                      </Button>
                    </Can>
                  )}
                </CardFooter>
              </Card>
            )
          })}
        </div>
      </div>

      <Dialog
        open={!!confirmDialog}
        onOpenChange={(open) => {
          if (!open)
            setConfirmDialog(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog?.type === 'upgrade'
                ? t('subscriptions.confirmUpgrade')
                : t('subscriptions.confirmCancel')}
            </DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            {confirmDialog?.type === 'upgrade'
              ? t('subscriptions.confirmUpgradeDescription')
              : t('subscriptions.confirmCancelDescription')}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant={confirmDialog?.type === 'cancel' ? 'destructive' : 'default'}
              disabled={isUpgrading || isCancelling}
              onClick={() => {
                if (confirmDialog?.type === 'upgrade' && confirmDialog.planId) {
                  upgrade(confirmDialog.planId)
                }
                else {
                  cancel()
                }
              }}
            >
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
