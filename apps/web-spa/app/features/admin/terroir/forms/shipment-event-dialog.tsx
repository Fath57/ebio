import type { ExportShipmentEventInput, ExportShipmentStatus } from '../utils/terroir-types'
import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@boilerstone/ui/components/primitives/dialog'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from '@boilerstone/ui/components/primitives/form'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@boilerstone/ui/components/primitives/select'
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { PUBLISHABLE_STEPS } from '../utils/terroir-types'

const NO_STEP = 'none'

interface ShipmentEventDialogProps {
  /** `departure`: one step for every parcel, the step required; `shipment`: a step and / or a free message. */
  scope: 'departure' | 'shipment'
  description: string
  isPending: boolean
  error: string | null
  onSubmit: (input: ExportShipmentEventInput) => void
  onClose: () => void
}

/**
 * Publishes a step of the timeline, the buyer is told by push and e-mail.
 * On a parcel the staff may also write a free message or the pickup address
 * shown with the step (the parcel's own point by default).
 */
export function ShipmentEventDialog({ scope, description, isPending, error, onSubmit, onClose }: ShipmentEventDialogProps) {
  const { t } = useTranslation()
  const schema = z.object({
    step: z.string(),
    message: z.string().trim().max(1000),
    pickupPoint: z.string().trim().max(500),
  }).superRefine((value, ctx) => {
    if (scope === 'departure' && value.step === NO_STEP)
      ctx.addIssue({ code: 'custom', path: ['step'], message: 'admin.terroir.validation.step' })
    if (scope === 'shipment' && value.step === NO_STEP && !value.message.trim())
      ctx.addIssue({ code: 'custom', path: ['message'], message: 'admin.terroir.validation.stepOrMessage' })
  })
  type EventFormData = z.infer<typeof schema>

  const form = useForm<EventFormData>({
    resolver: zodResolver(schema),
    defaultValues: { step: scope === 'departure' ? PUBLISHABLE_STEPS[0] : NO_STEP, message: '', pickupPoint: '' },
  })
  const step = form.watch('step')

  const submit = (values: EventFormData) => {
    onSubmit({
      step: values.step === NO_STEP ? null : values.step as ExportShipmentStatus,
      message: values.message.trim() || null,
      ...(scope === 'shipment' ? { pickupPoint: values.pickupPoint.trim() || null } : {}),
    })
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next)
          onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{scope === 'departure' ? t('admin.terroir.events.departureTitle') : t('admin.terroir.events.shipmentTitle')}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
            <FormField
              control={form.control}
              name="step"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>{t('admin.terroir.events.step')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {scope === 'shipment' && <SelectItem value={NO_STEP}>{t('admin.terroir.events.noStep')}</SelectItem>}
                      {PUBLISHABLE_STEPS.map(item => (
                        <SelectItem key={item} value={item}>{t(`admin.terroir.shipmentStatus.${item}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.error?.message && <p className="text-destructive text-sm">{t(fieldState.error.message)}</p>}
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="message"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>{t('admin.terroir.events.message')}</FormLabel>
                  <FormControl><Textarea {...field} rows={3} maxLength={1000} /></FormControl>
                  <FormDescription>{t('admin.terroir.events.messageHint')}</FormDescription>
                  {fieldState.error?.message && <p className="text-destructive text-sm">{t(fieldState.error.message)}</p>}
                </FormItem>
              )}
            />
            {scope === 'shipment' && step === 'READY_FOR_PICKUP' && (
              <FormField
                control={form.control}
                name="pickupPoint"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.terroir.events.pickupPoint')}</FormLabel>
                    <FormControl><Input {...field} maxLength={500} /></FormControl>
                    <FormDescription>{t('admin.terroir.events.pickupPointHint')}</FormDescription>
                  </FormItem>
                )}
              />
            )}
            {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={isPending}>{isPending ? t('common.saving') : t('admin.terroir.events.publish')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
