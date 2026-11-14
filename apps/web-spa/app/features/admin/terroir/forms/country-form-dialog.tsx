import type { ExportCountryAdmin, ExportCountryInput } from '../utils/terroir-types'
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
import { EXPORT_COUNTRY_CURRENCIES } from '../utils/terroir-types'

const countrySchema = z.object({
  code: z.string().trim().regex(/^[A-Z]{2}$/i, 'admin.terroir.validation.countryCode'),
  name: z.string().trim().min(2, 'admin.terroir.validation.nameMin').max(80),
  toPhrase: z.string().trim().min(3, 'admin.terroir.validation.phraseMin').max(120),
  inPhrase: z.string().trim().min(3, 'admin.terroir.validation.phraseMin').max(120),
  displayCurrency: z.enum(EXPORT_COUNTRY_CURRENCIES),
  flagEmoji: z.string().trim().max(16),
  sortOrder: z.string().trim().regex(/^\d{1,5}$/, 'admin.terroir.validation.sortOrder'),
  isActive: z.boolean(),
})

type CountryFormData = z.infer<typeof countrySchema>

interface CountryFormDialogProps {
  /** Null: a new country. */
  country: ExportCountryAdmin | null
  /** Suggested display order for a new country (after the last one). */
  nextSortOrder: number
  isPending: boolean
  error: string | null
  onSubmit: (input: ExportCountryInput) => void
  onClose: () => void
}

/**
 * A destination country: its ISO code (fixed once created), its name, the two
 * phrases the apps build sentences with, the currency buyers there read prices
 * in, an optional flag and its place in the lists.
 */
export function CountryFormDialog({ country, nextSortOrder, isPending, error, onSubmit, onClose }: CountryFormDialogProps) {
  const { t } = useTranslation()
  const form = useForm<CountryFormData>({
    resolver: zodResolver(countrySchema),
    defaultValues: {
      code: country?.code ?? '',
      name: country?.name ?? '',
      toPhrase: country?.toPhrase ?? '',
      inPhrase: country?.inPhrase ?? '',
      displayCurrency: country?.displayCurrency ?? 'EUR',
      flagEmoji: country?.flagEmoji ?? '',
      sortOrder: String(country?.sortOrder ?? nextSortOrder),
      isActive: country?.isActive ?? true,
    },
  })

  const errorText = (message: string | undefined) => message
    ? <p className="text-destructive text-sm">{t(message)}</p>
    : null

  const submit = (values: CountryFormData) => {
    onSubmit({
      code: values.code.trim().toUpperCase(),
      name: values.name.trim(),
      toPhrase: values.toPhrase.trim(),
      inPhrase: values.inPhrase.trim(),
      displayCurrency: values.displayCurrency,
      flagEmoji: values.flagEmoji.trim() || null,
      sortOrder: Number(values.sortOrder),
      ...(country ? {} : { isActive: values.isActive }),
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {country ? t('admin.terroir.countries.editTitle', { name: country.name }) : t('admin.terroir.countries.createTitle')}
          </DialogTitle>
          <DialogDescription>{t('admin.terroir.countries.formDescription')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
            <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
              <FormField
                control={form.control}
                name="code"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t('admin.terroir.countries.fields.code')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={Boolean(country)}
                        maxLength={2}
                        autoCapitalize="characters"
                        className="font-mono uppercase"
                        placeholder="CA"
                        onChange={event => field.onChange(event.target.value.toUpperCase())}
                      />
                    </FormControl>
                    {errorText(fieldState.error?.message)}
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t('admin.terroir.countries.fields.name')}</FormLabel>
                    <FormControl>
                      <Input {...field} maxLength={80} placeholder={t('admin.terroir.countries.fields.namePlaceholder')} />
                    </FormControl>
                    {errorText(fieldState.error?.message)}
                  </FormItem>
                )}
              />
            </div>
            {country && <p className="text-muted-foreground -mt-2 text-xs">{t('admin.terroir.countries.fields.codeLocked')}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="toPhrase"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t('admin.terroir.countries.fields.toPhrase')}</FormLabel>
                    <FormControl>
                      <Input {...field} maxLength={120} placeholder={t('admin.terroir.countries.fields.toPhrasePlaceholder')} />
                    </FormControl>
                    <FormDescription>{t('admin.terroir.countries.fields.toPhraseHint')}</FormDescription>
                    {errorText(fieldState.error?.message)}
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="inPhrase"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t('admin.terroir.countries.fields.inPhrase')}</FormLabel>
                    <FormControl>
                      <Input {...field} maxLength={120} placeholder={t('admin.terroir.countries.fields.inPhrasePlaceholder')} />
                    </FormControl>
                    <FormDescription>{t('admin.terroir.countries.fields.inPhraseHint')}</FormDescription>
                    {errorText(fieldState.error?.message)}
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="displayCurrency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.terroir.countries.fields.displayCurrency')}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {EXPORT_COUNTRY_CURRENCIES.map(currency => (
                          <SelectItem key={currency} value={currency}>{t(`admin.terroir.countries.currencies.${currency}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="flagEmoji"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.terroir.countries.fields.flagEmoji')}</FormLabel>
                    <FormControl><Input {...field} maxLength={16} placeholder="🇨🇦" /></FormControl>
                    <FormDescription>{t('admin.terroir.departures.fields.optional')}</FormDescription>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sortOrder"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t('admin.terroir.countries.fields.sortOrder')}</FormLabel>
                    <FormControl><Input inputMode="numeric" {...field} maxLength={5} /></FormControl>
                    <FormDescription>{t('admin.terroir.countries.fields.sortOrderHint')}</FormDescription>
                    {errorText(fieldState.error?.message)}
                  </FormItem>
                )}
              />
            </div>
            {!country && (
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4">
                    <FormLabel>{t('admin.terroir.countries.fields.isActive')}</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
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
