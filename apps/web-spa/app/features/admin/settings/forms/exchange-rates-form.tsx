import type { Resolver } from 'react-hook-form'
import type { ExchangeRatesData, ExchangeRatesUpdate, FxCurrency } from '../utils/exchange-rates-queries'
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
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { formatRelative } from '../../deliveries/utils/deliveries-queries'
import { FX_CURRENCIES } from '../utils/exchange-rates-queries'

/** An empty field means "no rate yet": left out of the request rather than sent as 0. */
const rateField = z.preprocess(
  value => (value === '' || value === null ? undefined : value),
  z.coerce.number().positive().max(100000).optional(),
)

const exchangeRatesSchema = z.object({
  EUR: rateField,
  USD: rateField,
  CAD: rateField,
  /** Margin in percent, as typed (2 = 2 % = 200 bps). */
  marginPercent: z.coerce.number().min(0).max(10),
})

export type ExchangeRatesFormData = z.infer<typeof exchangeRatesSchema>

interface ExchangeRatesFormProps {
  data: ExchangeRatesData
  onSubmit: (update: ExchangeRatesUpdate) => void
  isPending: boolean
  onRefresh: () => void
  isRefreshing: boolean
}

function toFormValues(data: ExchangeRatesData): ExchangeRatesFormData {
  return {
    EUR: data.rates.EUR?.xofPerUnit,
    USD: data.rates.USD?.xofPerUnit,
    CAD: data.rates.CAD?.xofPerUnit,
    marginPercent: data.marginBps / 100,
  }
}

/**
 * FCFA for one unit of each foreign currency, and the margin eBio adds on top.
 *
 * Only the rates the admin actually touched are sent: a rate sent becomes
 * MANUAL and stops following the daily download, so saving the margin alone
 * must not freeze the automatic ones. EUR is a fixed parity and never moves
 * on its own.
 */
export function ExchangeRatesForm({ data, onSubmit, isPending, onRefresh, isRefreshing }: ExchangeRatesFormProps) {
  const { t, i18n } = useTranslation()
  const defaultValues = useMemo(() => toFormValues(data), [data])
  const form = useForm<ExchangeRatesFormData>({
    resolver: zodResolver(exchangeRatesSchema) as Resolver<ExchangeRatesFormData>,
    defaultValues,
  })

  // Keep the fields in sync when the query refetches (save, refresh).
  useEffect(() => {
    form.reset(defaultValues)
  }, [defaultValues, form])

  const handleSubmit = (values: ExchangeRatesFormData) => {
    const rates: Partial<Record<FxCurrency, number>> = {}
    for (const currency of FX_CURRENCIES) {
      const value = values[currency]
      if (value !== undefined && value !== data.rates[currency]?.xofPerUnit)
        rates[currency] = value
    }
    const marginBps = Math.round(values.marginPercent * 100)
    onSubmit({
      rates,
      marginBps: marginBps === data.marginBps ? undefined : marginBps,
    })
  }

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={form.handleSubmit(handleSubmit)}>
        <div className="grid gap-6 md:grid-cols-3">
          {FX_CURRENCIES.map((currency) => {
            const entry = data.rates[currency]
            const fieldId = `exchange-rate-${currency.toLowerCase()}`
            const updated = formatRelative(entry?.updatedAt ?? null, i18n.language)
            return (
              <FormField
                key={currency}
                control={form.control}
                name={currency}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor={fieldId}>{t(`admin.settings.exchangeRates.label.${currency}`)}</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <Input
                          id={fieldId}
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          className="w-40 font-mono"
                          {...field}
                          value={field.value ?? ''}
                        />
                        <span className="text-muted-foreground text-sm">FCFA</span>
                      </div>
                    </FormControl>
                    <FormDescription>
                      {entry
                        ? t('admin.settings.exchangeRates.sourceLine', {
                            source: t(`admin.settings.exchangeRates.source.${entry.source}`),
                            date: updated ?? t('admin.settings.exchangeRates.neverUpdated'),
                          })
                        : t('admin.settings.exchangeRates.missing')}
                    </FormDescription>
                    {currency === 'EUR' && (
                      <FormDescription>{t('admin.settings.exchangeRates.eurHint')}</FormDescription>
                    )}
                    {entry?.stale && (
                      <p
                        role="status"
                        className="flex items-start gap-2 rounded-md border border-ebio-earth-200 bg-ebio-earth-50 p-3 text-sm text-ebio-earth-800 dark:border-ebio-earth-800 dark:bg-ebio-earth-900 dark:text-ebio-earth-100"
                      >
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        {t('admin.settings.exchangeRates.stale')}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )
          })}
        </div>

        <FormField
          control={form.control}
          name="marginPercent"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="exchange-margin">{t('admin.settings.exchangeRates.margin')}</FormLabel>
              <FormControl>
                <div className="flex items-center gap-2">
                  <Input
                    id="exchange-margin"
                    type="number"
                    min={0}
                    max={10}
                    step={0.1}
                    inputMode="decimal"
                    className="w-28 font-mono"
                    {...field}
                  />
                  <span className="text-muted-foreground text-sm">%</span>
                </div>
              </FormControl>
              <FormDescription>{t('admin.settings.exchangeRates.marginHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? t('common.saving') : t('common.save')}
          </Button>
          <Button type="button" variant="outline" disabled={isRefreshing} onClick={onRefresh}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden />
            {t('admin.settings.exchangeRates.refresh')}
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">{t('admin.settings.exchangeRates.refreshHint')}</p>
      </form>
    </Form>
  )
}
