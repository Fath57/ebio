import type { Resolver } from 'react-hook-form'
import type { AdminOrderDetail } from '../utils/orders-queries'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@boilerstone/ui/components/primitives/select'
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { fromBeninDateTime, toBeninDateTime } from '../utils/delivery-window'

const DEFAULT_WINDOW_HOURS = 2
const TIME_PATTERN = /^\d{2}:\d{2}$/

const deliveryWindowSchema = z.object({
  mode: z.enum(['asap', 'window']),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  slotText: z.string().trim().max(200),
  reason: z.string().trim().max(500),
}).superRefine((values, context) => {
  if (values.mode === 'asap')
    return
  if (!values.date)
    context.addIssue({ code: 'custom', path: ['date'], message: 'required' })
  if (!TIME_PATTERN.test(values.startTime))
    context.addIssue({ code: 'custom', path: ['startTime'], message: 'required' })
  if (!TIME_PATTERN.test(values.endTime) || values.endTime <= values.startTime)
    context.addIssue({ code: 'custom', path: ['endTime'], message: 'endAfterStart' })
})

export type DeliveryWindowFormData = z.infer<typeof deliveryWindowSchema>

export interface DeliveryWindowSubmit {
  start: string | null
  end: string | null
  slotText?: string
  reason?: string
}

interface DeliveryWindowFormProps {
  order: AdminOrderDetail
  isPending: boolean
  onSubmit: (input: DeliveryWindowSubmit) => void
  onCancel: () => void
}

/** The order's window, or the next two hours from now. */
function buildDefaults(order: AdminOrderDetail): DeliveryWindowFormData {
  if (order.deliveryWindowStart && order.deliveryWindowEnd) {
    const start = toBeninDateTime(order.deliveryWindowStart)
    const end = toBeninDateTime(order.deliveryWindowEnd)
    return { mode: 'window', date: start.date, startTime: start.time, endTime: end.time, slotText: '', reason: '' }
  }
  const nextHour = new Date()
  nextHour.setUTCMinutes(0, 0, 0)
  nextHour.setUTCHours(nextHour.getUTCHours() + 1)
  const start = toBeninDateTime(nextHour)
  const end = toBeninDateTime(new Date(nextHour.getTime() + DEFAULT_WINDOW_HOURS * 60 * 60 * 1000))
  return { mode: 'asap', date: start.date, startTime: start.time, endTime: end.time, slotText: '', reason: '' }
}

function toSubmit(values: DeliveryWindowFormData): DeliveryWindowSubmit {
  const optional = {
    slotText: values.slotText || undefined,
    reason: values.reason || undefined,
  }
  if (values.mode === 'asap')
    return { start: null, end: null, ...optional }
  return {
    start: fromBeninDateTime({ date: values.date, time: values.startTime }),
    end: fromBeninDateTime({ date: values.date, time: values.endTime }),
    ...optional,
  }
}

/** Back office sets when the buyer wants the parcel; the courier search follows. */
export function DeliveryWindowForm({ order, isPending, onSubmit, onCancel }: DeliveryWindowFormProps) {
  const { t } = useTranslation()
  const form = useForm<DeliveryWindowFormData>({
    resolver: zodResolver(deliveryWindowSchema) as Resolver<DeliveryWindowFormData>,
    defaultValues: buildDefaults(order),
  })
  const mode = form.watch('mode')

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(values => onSubmit(toSubmit(values)))}>
        <FormField
          control={form.control}
          name="mode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('admin.orders.window.mode')}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="asap">{t('admin.orders.window.asap')}</SelectItem>
                  <SelectItem value="window">{t('admin.orders.window.window')}</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {mode === 'window' && (
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin.orders.window.date')}</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="startTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin.orders.window.from')}</FormLabel>
                  <FormControl>
                    <Input type="time" step={900} {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="endTime"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>{t('admin.orders.window.to')}</FormLabel>
                  <FormControl>
                    <Input type="time" step={900} {...field} />
                  </FormControl>
                  {fieldState.error && (
                    <p className="text-destructive text-sm">{t('admin.orders.window.endAfterStart')}</p>
                  )}
                </FormItem>
              )}
            />
            <p className="text-muted-foreground text-sm sm:col-span-3">{t('admin.orders.window.timezone')}</p>
          </div>
        )}

        <FormField
          control={form.control}
          name="slotText"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('admin.orders.window.slotText')}</FormLabel>
              <FormControl>
                <Input placeholder={order.deliverySlot ?? ''} {...field} />
              </FormControl>
              <FormDescription>{t('admin.orders.window.slotTextHint')}</FormDescription>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('admin.orders.window.reason')}</FormLabel>
              <FormControl>
                <Textarea rows={2} placeholder={t('admin.orders.window.reasonPlaceholder')} {...field} />
              </FormControl>
            </FormItem>
          )}
        />

        <p className="text-muted-foreground text-sm">{t('admin.orders.window.effect')}</p>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Form>
  )
}
