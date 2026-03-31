import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@boilerstone/ui/components/primitives/form'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Switch } from '@boilerstone/ui/components/primitives/switch'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

const daySchema = z.object({
  open: z.string(),
  close: z.string(),
  closed: z.boolean().optional(),
})

const openingHoursSchema = z.object({
  monday: daySchema,
  tuesday: daySchema,
  wednesday: daySchema,
  thursday: daySchema,
  friday: daySchema,
  saturday: daySchema,
  sunday: daySchema,
})

export type OpeningHoursFormData = z.infer<typeof openingHoursSchema>

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

const defaultDay = { open: '08:00', close: '18:00', closed: true }

interface OpeningHoursFormProps {
  onSubmit: (data: OpeningHoursFormData) => void
  isPending: boolean
  initialData?: Record<string, { open: string, close: string, closed?: boolean }>
}

function buildDefaults(data?: Record<string, { open: string, close: string, closed?: boolean }>): OpeningHoursFormData {
  const result: Record<string, { open: string, close: string, closed?: boolean }> = {}
  for (const day of DAYS) {
    result[day] = data?.[day] ?? defaultDay
  }
  return result as OpeningHoursFormData
}

export function OpeningHoursForm({ onSubmit, isPending, initialData }: OpeningHoursFormProps) {
  const { t } = useTranslation()
  const form = useForm<OpeningHoursFormData>({
    resolver: zodResolver(openingHoursSchema),
    defaultValues: buildDefaults(),
  })

  useEffect(() => {
    if (initialData) {
      form.reset(buildDefaults(initialData))
    }
  }, [initialData, form])

  return (
    <Form {...form}>
      <form className="space-y-2" onSubmit={form.handleSubmit(onSubmit)}>
        {DAYS.map(day => (
          <div key={day} className="flex items-center gap-4 rounded-lg border px-4 py-3">
            <div className="w-28 shrink-0">
              <span className="text-sm font-medium">{t(`settings.openingHours.days.${day}`)}</span>
            </div>

            <FormField
              control={form.control}
              name={`${day}.closed`}
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Switch
                      checked={!field.value}
                      onCheckedChange={checked => field.onChange(!checked)}
                    />
                  </FormControl>
                  <FormLabel className="text-sm">
                    {field.value ? t('settings.openingHours.closed') : t('settings.openingHours.open')}
                  </FormLabel>
                </FormItem>
              )}
            />

            {!form.watch(`${day}.closed`) && (
              <div className="flex items-center gap-2">
                <FormField
                  control={form.control}
                  name={`${day}.open`}
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input {...field} type="time" className="w-32" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <span className="text-sm text-muted-foreground">{t('settings.openingHours.to')}</span>
                <FormField
                  control={form.control}
                  name={`${day}.close`}
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input {...field} type="time" className="w-32" />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            )}
          </div>
        ))}

        <div className="pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Form>
  )
}
