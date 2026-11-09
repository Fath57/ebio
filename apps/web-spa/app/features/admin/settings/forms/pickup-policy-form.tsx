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
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

/** Same bounds as the API; the reminder must land before the release. */
const pickupPolicySchema = z.object({
  timeoutMinutes: z.coerce.number().int().min(10).max(180),
  warningMinutes: z.coerce.number().int().min(1).max(179),
}).refine(policy => policy.warningMinutes < policy.timeoutMinutes, {
  path: ['warningMinutes'],
  message: 'warningBeforeTimeout',
})

export type PickupPolicyFormData = z.infer<typeof pickupPolicySchema>

interface PickupPolicyFormProps {
  policy: PickupPolicyFormData
  onSubmit: (policy: PickupPolicyFormData) => void
  isPending: boolean
}

/** How long a courier has to collect a run, and when they are reminded. */
export function PickupPolicyForm({ policy, onSubmit, isPending }: PickupPolicyFormProps) {
  const { t } = useTranslation()
  const form = useForm<PickupPolicyFormData>({
    resolver: zodResolver(pickupPolicySchema) as Resolver<PickupPolicyFormData>,
    defaultValues: policy,
  })

  // Keep the fields in sync when the settings query refetches.
  useEffect(() => {
    form.reset(policy)
  }, [policy, form])

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="timeoutMinutes"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="courier-pickup-timeout">{t('admin.settings.pickupPolicy.timeout')}</FormLabel>
              <FormControl>
                <div className="flex items-center gap-2">
                  <Input id="courier-pickup-timeout" type="number" min={10} max={180} step={5} className="w-36" {...field} />
                  <span className="text-muted-foreground text-sm">{t('admin.settings.pickupPolicy.unit')}</span>
                </div>
              </FormControl>
              <FormDescription>{t('admin.settings.pickupPolicy.timeoutHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="warningMinutes"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel htmlFor="courier-pickup-warning">{t('admin.settings.pickupPolicy.warning')}</FormLabel>
              <FormControl>
                <div className="flex items-center gap-2">
                  <Input id="courier-pickup-warning" type="number" min={1} max={179} step={1} className="w-36" {...field} />
                  <span className="text-muted-foreground text-sm">{t('admin.settings.pickupPolicy.unit')}</span>
                </div>
              </FormControl>
              <FormDescription>{t('admin.settings.pickupPolicy.warningHint')}</FormDescription>
              {fieldState.error?.message === 'warningBeforeTimeout'
                ? <p className="text-destructive text-sm">{t('admin.settings.pickupPolicy.warningBeforeTimeout')}</p>
                : <FormMessage />}
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
