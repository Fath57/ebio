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

const escrowReleaseSchema = z.object({
  heuresApresConfirmation: z.coerce.number().int().min(0).max(720),
  joursMaximum: z.coerce.number().int().min(1).max(60),
}).refine(
  value => value.heuresApresConfirmation <= value.joursMaximum * 24,
  { message: 'admin.settings.escrowRelease.invalid', path: ['heuresApresConfirmation'] },
)

export type EscrowReleaseFormData = z.infer<typeof escrowReleaseSchema>

interface EscrowReleaseFormProps {
  delays: EscrowReleaseFormData
  onSubmit: (delays: EscrowReleaseFormData) => void
  isPending: boolean
}

/**
 * When a shop is paid for an order settled online.
 *
 * Two delays, both counted from the delivery: a short one once buyer and shop
 * both confirmed it, and a ceiling so a forgotten confirmation never holds the
 * money. The same rule as the API: the first cannot exceed the second.
 */
export function EscrowReleaseForm({ delays, onSubmit, isPending }: EscrowReleaseFormProps) {
  const { t } = useTranslation()
  const form = useForm<EscrowReleaseFormData>({
    resolver: zodResolver(escrowReleaseSchema) as Resolver<EscrowReleaseFormData>,
    defaultValues: delays,
  })

  // Keep the fields in sync when the query refetches.
  useEffect(() => {
    form.reset(delays)
  }, [delays, form])

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="heuresApresConfirmation"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel htmlFor="escrow-after-confirmation">{t('admin.settings.escrowRelease.afterConfirmation')}</FormLabel>
                <FormControl>
                  <Input id="escrow-after-confirmation" type="number" min={0} max={720} {...field} />
                </FormControl>
                <FormDescription>{t('admin.settings.escrowRelease.afterConfirmationHint')}</FormDescription>
                {fieldState.error?.message === 'admin.settings.escrowRelease.invalid'
                  ? <p className="text-destructive text-sm">{t('admin.settings.escrowRelease.invalid')}</p>
                  : <FormMessage />}
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="joursMaximum"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="escrow-maximum">{t('admin.settings.escrowRelease.maximum')}</FormLabel>
                <FormControl>
                  <Input id="escrow-maximum" type="number" min={1} max={60} {...field} />
                </FormControl>
                <FormDescription>{t('admin.settings.escrowRelease.maximumHint')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" disabled={isPending}>
          {t('common.save')}
        </Button>
      </form>
    </Form>
  )
}
