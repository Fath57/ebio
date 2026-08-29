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

/** Percent as typed by the admin; the API stores a 0–0.5 fraction. */
const deliveryCommissionSchema = z.object({
  percent: z.coerce.number().min(0).max(50),
})

export type DeliveryCommissionFormData = z.infer<typeof deliveryCommissionSchema>

interface DeliveryCommissionFormProps {
  /** Current rate as a fraction (0.10 = 10 %). */
  rate: number
  onSubmit: (rate: number) => void
  isPending: boolean
}

function toPercent(rate: number): number {
  return Math.round(rate * 10000) / 100
}

/**
 * Single percent field for eBio's share of the delivery fee. The value is
 * converted back to a fraction before it reaches the API.
 */
export function DeliveryCommissionForm({ rate, onSubmit, isPending }: DeliveryCommissionFormProps) {
  const { t } = useTranslation()
  const form = useForm<DeliveryCommissionFormData>({
    resolver: zodResolver(deliveryCommissionSchema) as Resolver<DeliveryCommissionFormData>,
    defaultValues: { percent: toPercent(rate) },
  })

  // Keep the field in sync when the settings query refetches.
  useEffect(() => {
    form.reset({ percent: toPercent(rate) })
  }, [rate, form])

  const handleSubmit = (data: DeliveryCommissionFormData) => {
    onSubmit(data.percent / 100)
  }

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(handleSubmit)}>
        <FormField
          control={form.control}
          name="percent"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="delivery-commission-percent">{t('admin.settings.deliveryCommission.rate')}</FormLabel>
              <FormControl>
                <div className="flex items-center gap-2">
                  <Input
                    id="delivery-commission-percent"
                    type="number"
                    min={0}
                    max={50}
                    step={0.1}
                    className="w-24"
                    {...field}
                  />
                  <span className="text-muted-foreground text-sm">%</span>
                </div>
              </FormControl>
              <FormDescription>{t('admin.settings.deliveryCommission.rateHint')}</FormDescription>
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
