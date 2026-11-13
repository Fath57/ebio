import {
  adminFamilyWalletSettingControllerGet,
  adminFamilyWalletSettingControllerUpdate,
} from '@boilerstone/openapi-generator/client/sdk.gen'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { Label } from '@boilerstone/ui/components/primitives/label'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { Switch } from '@boilerstone/ui/components/primitives/switch'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface FamilyWalletSetting {
  enabled: boolean
}

const QUERY_KEY = ['admin', 'family-wallet-setting']

/**
 * The platform switch of the family wallet (010). Off, the apps hide the
 * feature and refuse new family payments; existing wallets stay reachable
 * from the back office. It saves on the flick, like the assistant's switch.
 */
export function FamilyWalletSettingCard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [feedback, setFeedback] = useState<'saved' | 'error' | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await adminFamilyWalletSettingControllerGet()
      if (response.error)
        throw new Error('Failed to fetch family wallet setting')
      return response.data as FamilyWalletSetting
    },
  })

  const { mutate, isPending } = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await adminFamilyWalletSettingControllerUpdate({ body: { enabled } })
      if (response.error)
        throw new Error('Failed to update family wallet setting')
      return response.data as FamilyWalletSetting
    },
    onMutate: () => {
      setFeedback(null)
    },
    onSuccess: (saved) => {
      setFeedback('saved')
      queryClient.setQueryData(QUERY_KEY, saved)
    },
    onError: () => {
      setFeedback('error')
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin.settings.familyWallet.title')}</CardTitle>
        <p className="text-muted-foreground text-sm">{t('admin.settings.familyWallet.description')}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          role="note"
          className="border-ebio-earth-200 bg-ebio-earth-50 text-ebio-earth-800 dark:border-ebio-earth-800 dark:bg-ebio-earth-900 dark:text-ebio-earth-100 flex gap-3 rounded-md border p-3 text-sm"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{t('admin.settings.familyWallet.legalWarning')}</p>
        </div>
        {isLoading || !data
          ? <Skeleton className="h-12 w-full" />
          : (
              <div className="flex items-start justify-between gap-6">
                <div className="space-y-1">
                  <Label htmlFor="family-wallet-enabled" className="text-base">
                    {t('admin.settings.familyWallet.toggleLabel')}
                  </Label>
                  <p className="text-muted-foreground text-sm">
                    {data.enabled
                      ? t('admin.settings.familyWallet.stateOpen')
                      : t('admin.settings.familyWallet.stateClosed')}
                  </p>
                </div>
                <Switch
                  id="family-wallet-enabled"
                  checked={data.enabled}
                  disabled={isPending}
                  onCheckedChange={enabled => mutate(enabled)}
                />
              </div>
            )}
        {feedback === 'saved' && (
          <p className="text-ebio-green-600 dark:text-ebio-green-200 text-sm">{t('admin.settings.familyWallet.saved')}</p>
        )}
        {feedback === 'error' && (
          <p className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border p-3 text-sm" role="alert">
            {t('admin.settings.familyWallet.error')}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
