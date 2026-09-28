import type { Resolver } from 'react-hook-form'
import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@boilerstone/ui/components/primitives/form'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Switch } from '@boilerstone/ui/components/primitives/switch'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

/** Reflète le contrat de l'API ; `z.coerce` absorbe les saisies en texte. */
const referralRewardsSchema = z.object({
  sponsorAmount: z.coerce.number().int().min(0).max(100000),
  refereeAmount: z.coerce.number().int().min(0).max(100000),
  minOrderAmount: z.coerce.number().int().min(0).max(1000000),
  active: z.boolean(),
})

export type ReferralRewardsFormData = z.infer<typeof referralRewardsSchema>

interface ReferralRewardsFormProps {
  rewards: ReferralRewardsFormData
  onSubmit: (rewards: ReferralRewardsFormData) => void
  isPending: boolean
}

/**
 * Ce que rapporte un parrainage, et à partir de quel panier.
 *
 * Les deux montants sont versés à la première commande livrée du filleul. Le
 * plancher évite qu'un achat à deux cents francs déclenche deux récompenses.
 * L'interrupteur suspend le programme sans effacer les liens déjà noués.
 */
export function ReferralRewardsForm({ rewards, onSubmit, isPending }: ReferralRewardsFormProps) {
  const { t } = useTranslation()
  const form = useForm<ReferralRewardsFormData>({
    resolver: zodResolver(referralRewardsSchema) as Resolver<ReferralRewardsFormData>,
    defaultValues: rewards,
  })

  // Garde les champs en phase quand la requête des réglages se rafraîchit.
  useEffect(() => {
    form.reset(rewards)
  }, [rewards, form])

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="sponsorAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="referral-sponsor-amount">{t('admin.settings.referral.sponsorAmount')}</FormLabel>
                <FormControl>
                  <Input id="referral-sponsor-amount" type="number" min={0} max={100000} step={100} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="refereeAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="referral-referee-amount">{t('admin.settings.referral.refereeAmount')}</FormLabel>
                <FormControl>
                  <Input id="referral-referee-amount" type="number" min={0} max={100000} step={100} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="minOrderAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="referral-min-order">{t('admin.settings.referral.minOrderAmount')}</FormLabel>
                <FormControl>
                  <Input id="referral-min-order" type="number" min={0} max={1000000} step={500} {...field} />
                </FormControl>
                <FormDescription>{t('admin.settings.referral.minOrderHint')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="active"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel htmlFor="referral-active">{t('admin.settings.referral.active')}</FormLabel>
                <FormDescription>{t('admin.settings.referral.activeHint')}</FormDescription>
              </div>
              <FormControl>
                <Switch id="referral-active" checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isPending}>
          {t('common.save')}
        </Button>
      </form>
    </Form>
  )
}
