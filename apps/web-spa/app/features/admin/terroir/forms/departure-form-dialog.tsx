import type { ReactNode } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import type { ExportAgency, ExportCountry, ExportDeparture, ExportDepartureInput, ExportDepartureRate, ExportDepartureStatus } from '../utils/terroir-types'
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
import { Switch } from '@boilerstone/ui/components/primitives/switch'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { fromDateTimeLocal, toDateTimeLocal } from '@/features/admin/common/utils/datetime-local'
import { EXPORT_COUNTRIES } from '../utils/terroir-types'

/** A number typed in a text field: comma or dot, empty allowed when optional. */
function parseDecimal(value: string): number | null {
  const normalised = value.trim().replace(',', '.')
  if (!normalised)
    return null
  const parsed = Number(normalised)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function requiredNumber(min: number) {
  return z.string().refine((value) => {
    const parsed = parseDecimal(value)
    return parsed != null && !Number.isNaN(parsed) && parsed >= min
  }, 'admin.terroir.validation.number')
}

const optionalNumber = z.string().refine((value) => {
  const parsed = parseDecimal(value)
  return parsed == null || (!Number.isNaN(parsed) && parsed >= 0)
}, 'admin.terroir.validation.number')

const rateSchema = z.object({
  enabled: z.boolean(),
  pricePerKg: z.string(),
  minBilledKg: z.string(),
  maxWeightKg: optionalNumber,
  homeDeliveryFee: optionalNumber,
})

const departureSchema = z.object({
  agencyId: z.string().min(1, 'admin.terroir.validation.agency'),
  departsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'admin.terroir.validation.date'),
  depositDeadline: z.string().min(1, 'admin.terroir.validation.date'),
  transitMinDays: requiredNumber(0),
  transitMaxDays: requiredNumber(0),
  capacityKg: optionalNumber,
  status: z.enum(['OPEN', 'FULL', 'DEPARTED']),
  rates: z.object({ FR: rateSchema, BE: rateSchema }),
}).superRefine((value, ctx) => {
  const min = parseDecimal(value.transitMinDays) ?? 0
  const max = parseDecimal(value.transitMaxDays) ?? 0
  if (max < min)
    ctx.addIssue({ code: 'custom', path: ['transitMaxDays'], message: 'admin.terroir.validation.transit' })
  const enabled = EXPORT_COUNTRIES.filter(country => value.rates[country].enabled)
  if (enabled.length === 0)
    ctx.addIssue({ code: 'custom', path: ['rates'], message: 'admin.terroir.validation.oneRate' })
  for (const country of enabled) {
    const rate = value.rates[country]
    const price = parseDecimal(rate.pricePerKg)
    if (price == null || Number.isNaN(price) || price <= 0)
      ctx.addIssue({ code: 'custom', path: ['rates', country, 'pricePerKg'], message: 'admin.terroir.validation.number' })
    const minKg = parseDecimal(rate.minBilledKg)
    if (minKg == null || Number.isNaN(minKg) || minKg < 0)
      ctx.addIssue({ code: 'custom', path: ['rates', country, 'minBilledKg'], message: 'admin.terroir.validation.number' })
  }
})

type DepartureFormData = z.infer<typeof departureSchema>
type RateFormData = DepartureFormData['rates']['FR']

function numberText(value: number | null | undefined): string {
  return value == null ? '' : String(value).replace('.', ',')
}

function rateDefaults(rate: ExportDepartureRate | undefined, enabled: boolean): RateFormData {
  return {
    enabled,
    pricePerKg: numberText(rate?.pricePerKg),
    minBilledKg: numberText(rate?.minBilledKg ?? 1),
    maxWeightKg: numberText(rate?.maxWeightKg),
    homeDeliveryFee: numberText(rate?.homeDeliveryFee),
  }
}

interface DepartureFormDialogProps {
  /** Null: a new departure. */
  departure: ExportDeparture | null
  agencies: ExportAgency[]
  isPending: boolean
  error: string | null
  onSubmit: (input: ExportDepartureInput & { status?: Exclude<ExportDepartureStatus, 'CANCELLED'> }) => void
  onClose: () => void
}

/**
 * A departure: the agency, the day it leaves, when the parcels must be at the
 * agency, the announced transit and, per country, what a kilo costs (duties
 * and taxes included), the minimum billed, the weight ceiling and the
 * optional home delivery fee.
 */
export function DepartureFormDialog({ departure, agencies, isPending, error, onSubmit, onClose }: DepartureFormDialogProps) {
  const { t } = useTranslation()
  const rateOf = (country: ExportCountry) => departure?.rates.find(rate => rate.country === country)
  const form = useForm<DepartureFormData>({
    resolver: zodResolver(departureSchema),
    defaultValues: {
      agencyId: departure?.agency.id ?? '',
      departsOn: departure?.departsOn.slice(0, 10) ?? '',
      depositDeadline: toDateTimeLocal(departure?.depositDeadline),
      transitMinDays: numberText(departure?.transitMinDays ?? 5),
      transitMaxDays: numberText(departure?.transitMaxDays ?? 10),
      capacityKg: numberText(departure?.fill.capacityKg),
      status: departure && departure.status !== 'CANCELLED' ? departure.status : 'OPEN',
      rates: {
        FR: rateDefaults(rateOf('FR'), departure ? Boolean(rateOf('FR')) : true),
        BE: rateDefaults(rateOf('BE'), departure ? Boolean(rateOf('BE')) : false),
      },
    },
  })

  const errorText = (message: string | undefined) => message
    ? <p className="text-destructive text-sm">{t(message)}</p>
    : null

  const submit = (values: DepartureFormData) => {
    const rates = EXPORT_COUNTRIES
      .filter(country => values.rates[country].enabled)
      .map((country) => {
        const rate = values.rates[country]
        return {
          country,
          pricePerKg: parseDecimal(rate.pricePerKg) ?? 0,
          minBilledKg: parseDecimal(rate.minBilledKg) ?? 0,
          maxWeightKg: parseDecimal(rate.maxWeightKg),
          homeDeliveryFee: parseDecimal(rate.homeDeliveryFee),
        }
      })
    onSubmit({
      agencyId: values.agencyId,
      departsOn: values.departsOn,
      depositDeadline: fromDateTimeLocal(values.depositDeadline) ?? values.depositDeadline,
      transitMinDays: Math.round(parseDecimal(values.transitMinDays) ?? 0),
      transitMaxDays: Math.round(parseDecimal(values.transitMaxDays) ?? 0),
      capacityKg: parseDecimal(values.capacityKg),
      rates,
      ...(departure ? { status: values.status } : {}),
    })
  }

  const selectableAgencies = agencies.filter(agency => agency.active || agency.id === departure?.agency.id)
  const ratesError = form.formState.errors.rates?.message

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next)
          onClose()
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{departure ? t('admin.terroir.departures.editTitle') : t('admin.terroir.departures.createTitle')}</DialogTitle>
          <DialogDescription>{t('admin.terroir.departures.formDescription')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-5" onSubmit={form.handleSubmit(submit)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="agencyId"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t('admin.terroir.departures.fields.agency')}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder={t('admin.terroir.departures.fields.agencyPlaceholder')} /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {selectableAgencies.map(agency => (
                          <SelectItem key={agency.id} value={agency.id}>{agency.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errorText(fieldState.error?.message)}
                  </FormItem>
                )}
              />
              {departure && (
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('admin.terroir.status')}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(['OPEN', 'FULL', 'DEPARTED'] as const).map(status => (
                            <SelectItem key={status} value={status}>{t(`admin.terroir.departureStatus.${status}`)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="departsOn"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t('admin.terroir.departures.fields.departsOn')}</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    {errorText(fieldState.error?.message)}
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="depositDeadline"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t('admin.terroir.departures.fields.depositDeadline')}</FormLabel>
                    <FormControl><Input type="datetime-local" {...field} /></FormControl>
                    <FormDescription>{t('admin.terroir.departures.fields.depositDeadlineHint')}</FormDescription>
                    {errorText(fieldState.error?.message)}
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="transitMinDays"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t('admin.terroir.departures.fields.transitMinDays')}</FormLabel>
                    <FormControl><Input inputMode="numeric" {...field} /></FormControl>
                    {errorText(fieldState.error?.message)}
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="transitMaxDays"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t('admin.terroir.departures.fields.transitMaxDays')}</FormLabel>
                    <FormControl><Input inputMode="numeric" {...field} /></FormControl>
                    {errorText(fieldState.error?.message)}
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="capacityKg"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t('admin.terroir.departures.fields.capacityKg')}</FormLabel>
                    <FormControl><Input inputMode="decimal" {...field} /></FormControl>
                    <FormDescription>{t('admin.terroir.departures.fields.capacityKgHint')}</FormDescription>
                    {errorText(fieldState.error?.message)}
                  </FormItem>
                )}
              />
            </div>

            <fieldset className="space-y-3">
              <legend className="font-semibold">{t('admin.terroir.departures.ratesTitle')}</legend>
              <p className="text-muted-foreground text-sm">{t('admin.terroir.departures.ratesHint')}</p>
              {EXPORT_COUNTRIES.map(country => (
                <RateFields key={country} form={form} country={country} errorText={errorText} />
              ))}
              {errorText(ratesError)}
            </fieldset>

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

interface RateFieldsProps {
  form: UseFormReturn<DepartureFormData>
  country: ExportCountry
  errorText: (message: string | undefined) => ReactNode
}

function RateFields({ form, country, errorText }: RateFieldsProps) {
  const { t } = useTranslation()
  const enabled = form.watch(`rates.${country}.enabled`)

  return (
    <div className="space-y-3 rounded-md border p-3">
      <FormField
        control={form.control}
        name={`rates.${country}.enabled`}
        render={({ field }) => (
          <FormItem className="flex items-center justify-between gap-4">
            <FormLabel className="text-base">{t(`admin.terroir.countries.${country}`)}</FormLabel>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} aria-label={t('admin.terroir.departures.rateToggle', { country: t(`admin.terroir.countries.${country}`) })} />
            </FormControl>
          </FormItem>
        )}
      />
      {enabled && (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name={`rates.${country}.pricePerKg`}
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>{t('admin.terroir.departures.fields.pricePerKg')}</FormLabel>
                <FormControl><Input inputMode="decimal" {...field} /></FormControl>
                {errorText(fieldState.error?.message)}
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={`rates.${country}.minBilledKg`}
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>{t('admin.terroir.departures.fields.minBilledKg')}</FormLabel>
                <FormControl><Input inputMode="decimal" {...field} /></FormControl>
                {errorText(fieldState.error?.message)}
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={`rates.${country}.maxWeightKg`}
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>{t('admin.terroir.departures.fields.maxWeightKg')}</FormLabel>
                <FormControl><Input inputMode="decimal" {...field} /></FormControl>
                <FormDescription>{t('admin.terroir.departures.fields.optional')}</FormDescription>
                {errorText(fieldState.error?.message)}
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={`rates.${country}.homeDeliveryFee`}
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>{t('admin.terroir.departures.fields.homeDeliveryFee')}</FormLabel>
                <FormControl><Input inputMode="decimal" {...field} /></FormControl>
                <FormDescription>{t('admin.terroir.departures.fields.homeDeliveryFeeHint')}</FormDescription>
                {errorText(fieldState.error?.message)}
              </FormItem>
            )}
          />
        </div>
      )}
    </div>
  )
}
