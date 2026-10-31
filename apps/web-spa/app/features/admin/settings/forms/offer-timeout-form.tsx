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

/** Same bounds as the API: under 20 s nobody can read the offer, over 10 min the buyer waits too long. */
const offerTimeoutSchema = z.object({
  seconds: z.coerce.number().int().min(20).max(600),
})

type OfferTimeoutFormData = z.infer<typeof offerTimeoutSchema>

interface OfferTimeoutFormProps {
  seconds: number
  onSubmit: (seconds: number) => void
  isPending: boolean
}

/** How long a run offered to one courier stays theirs before it moves on. */
export function OfferTimeoutForm({ seconds, onSubmit, isPending }: OfferTimeoutFormProps) {
  const { t } = useTranslation()
  const form = useForm<OfferTimeoutFormData>({
    resolver: zodResolver(offerTimeoutSchema) as Resolver<OfferTimeoutFormData>,
    defaultValues: { seconds },
  })

  // Keep the field in sync when the settings query refetches.
  useEffect(() => {
    form.reset({ seconds })
  }, [seconds, form])

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(data => onSubmit(data.seconds))}>
        <FormField
          control={form.control}
          name="seconds"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="courier-offer-timeout">{t('admin.settings.offerTimeout.seconds')}</FormLabel>
              <FormControl>
                <div className="flex items-center gap-2">
                  <Input id="courier-offer-timeout" type="number" min={20} max={600} step={5} className="w-36" {...field} />
                  <span className="text-muted-foreground text-sm">{t('admin.settings.offerTimeout.unit')}</span>
                </div>
              </FormControl>
              <FormDescription>{t('admin.settings.offerTimeout.hint')}</FormDescription>
              <FormMessage />
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
