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

const timingSchema = z.object({
  delaiHeures: z.coerce.number().int().min(1).max(720),
  relancesMaximum: z.coerce.number().int().min(1).max(10),
})

export type ProductReviewTimingFormData = z.infer<typeof timingSchema>

interface ProductReviewTimingFormProps {
  timing: ProductReviewTimingFormData
  onSubmit: (timing: ProductReviewTimingFormData) => void
  isPending: boolean
}

/**
 * When the buyer is asked what they thought of the products.
 *
 * The delay runs from the delivery for the first ask, then from the previous
 * one for each reminder — a single number to understand rather than two.
 */
export function ProductReviewTimingForm({ timing, onSubmit, isPending }: ProductReviewTimingFormProps) {
  const { t } = useTranslation()
  const form = useForm<ProductReviewTimingFormData>({
    resolver: zodResolver(timingSchema) as Resolver<ProductReviewTimingFormData>,
    defaultValues: timing,
  })

  // Keep the fields in sync when the query refetches.
  useEffect(() => {
    form.reset(timing)
  }, [timing, form])

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="delaiHeures"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="review-delay">{t('admin.settings.productReview.delay')}</FormLabel>
                <FormControl>
                  <Input id="review-delay" type="number" min={1} max={720} {...field} />
                </FormControl>
                <FormDescription>{t('admin.settings.productReview.delayHint')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="relancesMaximum"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="review-reminders">{t('admin.settings.productReview.reminders')}</FormLabel>
                <FormControl>
                  <Input id="review-reminders" type="number" min={1} max={10} {...field} />
                </FormControl>
                <FormDescription>{t('admin.settings.productReview.remindersHint')}</FormDescription>
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
