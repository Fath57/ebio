import type { ExportPickupPoint, ExportPickupPointInput } from '../utils/terroir-types'
import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@boilerstone/ui/components/primitives/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel } from '@boilerstone/ui/components/primitives/form'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@boilerstone/ui/components/primitives/select'
import { Switch } from '@boilerstone/ui/components/primitives/switch'
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { EXPORT_COUNTRIES } from '../utils/terroir-types'

const pickupPointSchema = z.object({
  country: z.enum(EXPORT_COUNTRIES),
  city: z.string().trim().min(2, 'admin.terroir.validation.cityMin').max(80),
  address: z.string().trim().min(5, 'admin.terroir.validation.addressMin').max(500),
  openingHours: z.string().trim().max(300),
  active: z.boolean(),
})

type PickupPointFormData = z.infer<typeof pickupPointSchema>

interface PickupPointFormDialogProps {
  agencyName: string
  /** Null: a new pickup point. */
  point: ExportPickupPoint | null
  isPending: boolean
  error: string | null
  onSubmit: (input: ExportPickupPointInput) => void
  onClose: () => void
}

/** Where buyers collect their parcel abroad: country, city, address and opening hours. */
export function PickupPointFormDialog({ agencyName, point, isPending, error, onSubmit, onClose }: PickupPointFormDialogProps) {
  const { t } = useTranslation()
  const form = useForm<PickupPointFormData>({
    resolver: zodResolver(pickupPointSchema),
    defaultValues: {
      country: point?.country ?? 'FR',
      city: point?.city ?? '',
      address: point?.address ?? '',
      openingHours: point?.openingHours ?? '',
      active: point?.active ?? true,
    },
  })

  const submit = (values: PickupPointFormData) => {
    onSubmit({
      country: values.country,
      city: values.city.trim(),
      address: values.address.trim(),
      openingHours: values.openingHours.trim() || null,
      active: values.active,
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
          <DialogTitle>{point ? t('admin.terroir.pickupPoints.editTitle') : t('admin.terroir.pickupPoints.createTitle')}</DialogTitle>
          <DialogDescription>{t('admin.terroir.pickupPoints.formDescription', { agency: agencyName })}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.terroir.pickupPoints.fields.country')}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {EXPORT_COUNTRIES.map(country => (
                          <SelectItem key={country} value={country}>{t(`admin.terroir.countries.${country}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="city"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t('admin.terroir.pickupPoints.fields.city')}</FormLabel>
                    <FormControl><Input {...field} maxLength={80} /></FormControl>
                    {fieldState.error?.message && <p className="text-destructive text-sm">{t(fieldState.error.message)}</p>}
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="address"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>{t('admin.terroir.pickupPoints.fields.address')}</FormLabel>
                  <FormControl><Textarea {...field} rows={2} maxLength={500} /></FormControl>
                  {fieldState.error?.message && <p className="text-destructive text-sm">{t(fieldState.error.message)}</p>}
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="openingHours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin.terroir.pickupPoints.fields.openingHours')}</FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={300} placeholder={t('admin.terroir.pickupPoints.fields.openingHoursPlaceholder')} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-4">
                  <FormLabel>{t('admin.terroir.pickupPoints.fields.active')}</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={isPending}>{isPending ? t('common.saving') : t('common.save')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
