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

/** Integer FCFA amount; 0 disables cash on delivery altogether. */
const cashLimitSchema = z.object({
  amount: z.coerce.number().int().min(0).max(10000000),
})

export type CashLimitFormData = z.infer<typeof cashLimitSchema>

interface CashLimitFormProps {
  /** Current cap in FCFA (0 = cash disabled). */
  amount: number
  onSubmit: (amount: number) => void
  isPending: boolean
}

/**
 * Single amount field for the maximum order total payable in cash on
 * delivery. The courier advances the goods at pickup, so this cap bounds
 * their exposure.
 */
export function CashLimitForm({ amount, onSubmit, isPending }: CashLimitFormProps) {
  const { t } = useTranslation()
  const form = useForm<CashLimitFormData>({
    resolver: zodResolver(cashLimitSchema) as Resolver<CashLimitFormData>,
    defaultValues: { amount },
  })

  // Keep the field in sync when the settings query refetches.
  useEffect(() => {
    form.reset({ amount })
  }, [amount, form])

  const handleSubmit = (data: CashLimitFormData) => {
    onSubmit(data.amount)
  }

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(handleSubmit)}>
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="cash-limit-amount">{t('admin.settings.cashLimit.amount')}</FormLabel>
              <FormControl>
                <div className="flex items-center gap-2">
                  <Input
                    id="cash-limit-amount"
                    type="number"
                    min={0}
                    max={10000000}
                    step={1}
                    className="w-36"
                    {...field}
                  />
                  <span className="text-muted-foreground text-sm">FCFA</span>
                </div>
              </FormControl>
              <FormDescription>{t('admin.settings.cashLimit.amountHint')}</FormDescription>
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
