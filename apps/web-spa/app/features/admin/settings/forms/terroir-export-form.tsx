import type { TFunction } from 'i18next'
import type { Resolver, UseFormReturn } from 'react-hook-form'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Checkbox } from '@boilerstone/ui/components/primitives/checkbox'
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
import { Label } from '@boilerstone/ui/components/primitives/label'
import { cn } from '@boilerstone/ui/lib/utils'
import { zodResolver } from '@hookform/resolvers/zod'
import { ExternalLink, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

export const COLLECTION_MODES = ['COURIER', 'EBIO'] as const
export type CollectionMode = typeof COLLECTION_MODES[number]

const PHONE_PATTERN = /^\+?[\d .-]{6,30}$/

/** An optional coordinate typed as text: empty, or a number within ±limit. */
function isCoordinate(value: string, limit: number): boolean {
  if (value === '')
    return true
  const number = Number(value)
  return Number.isFinite(number) && Math.abs(number) <= limit
}

function buildTerroirTuningSchema(t: TFunction) {
  return z.object({
    packagingWeightG: z.coerce.number().int().min(0).max(5_000),
    collectionDays: z.coerce.number().int().min(0).max(30),
    weightTolerancePct: z.coerce.number().int().min(0).max(100),
    /** Shown in percent, stored in basis points (2 % = 200). */
    insuranceRatePct: z.coerce.number().min(0).max(50),
    insuranceMin: z.coerce.number().int().min(0).max(1_000_000),
    bannedCategoryIds: z.array(z.string()).max(200),
    pickupReminderDays: z.coerce.number().int().min(1).max(90),
    minShelfLifeDays: z.coerce.number().int().min(1).max(3_650),
    maxUnitWeightG: z.coerce.number().int().min(100).max(50_000),
    collectionMode: z.enum(COLLECTION_MODES),
    hubName: z.string().trim().max(120),
    hubAddress: z.string().trim().max(255),
    hubPhone: z.string().trim().refine(value => value === '' || PHONE_PATTERN.test(value), t('admin.settings.terroirExport.collection.invalidPhone')),
    hubHours: z.string().trim().max(200),
    /** Coordinates stay text in the form: empty means « no position ». */
    hubLatitude: z.string().trim().refine(value => isCoordinate(value, 90), t('admin.settings.terroirExport.collection.invalidNumber')),
    hubLongitude: z.string().trim().refine(value => isCoordinate(value, 180), t('admin.settings.terroirExport.collection.invalidNumber')),
  }).superRefine((values, ctx) => {
    if ((values.hubLatitude === '') !== (values.hubLongitude === '')) {
      ctx.addIssue({
        code: 'custom',
        path: [values.hubLatitude === '' ? 'hubLatitude' : 'hubLongitude'],
        message: t('admin.settings.terroirExport.collection.positionPair'),
      })
    }
  })
}

export type TerroirTuningFormData = z.infer<ReturnType<typeof buildTerroirTuningSchema>>

export interface TerroirCategoryOption {
  id: string
  name: string
}

interface TerroirExportFormProps {
  values: TerroirTuningFormData
  categories: TerroirCategoryOption[]
  onSubmit: (values: TerroirTuningFormData) => void
  isPending: boolean
  /** What the API runs today: COURIER without the hub position runs as EBIO. */
  effectiveCollectionMode: CollectionMode
}

type NumberKey
  = | 'packagingWeightG'
    | 'collectionDays'
    | 'weightTolerancePct'
    | 'insuranceRatePct'
    | 'insuranceMin'
    | 'pickupReminderDays'
    | 'minShelfLifeDays'
    | 'maxUnitWeightG'

type HubTextKey = 'hubName' | 'hubAddress' | 'hubPhone' | 'hubHours' | 'hubLatitude' | 'hubLongitude'

interface NumberFieldProps {
  form: UseFormReturn<TerroirTuningFormData>
  name: NumberKey
  min: number
  max: number
  step?: number
}

function NumberField({ form, name, min, max, step = 1 }: NumberFieldProps) {
  const { t } = useTranslation()
  const id = `terroir-${name}`
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel htmlFor={id}>{t(`admin.settings.terroirExport.fields.${name}`)}</FormLabel>
          <FormControl>
            <Input id={id} type="number" min={min} max={max} step={step} {...field} />
          </FormControl>
          <FormDescription>{t(`admin.settings.terroirExport.fields.${name}Hint`)}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

interface HubFieldProps {
  form: UseFormReturn<TerroirTuningFormData>
  name: HubTextKey
  label: string
  placeholder?: string
  description?: string
  inputMode?: 'decimal' | 'tel'
}

function HubField({ form, name, label, placeholder, description, inputMode }: HubFieldProps) {
  const id = `terroir-${name}`
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel htmlFor={id}>{label}</FormLabel>
          <FormControl>
            <Input id={id} placeholder={placeholder} inputMode={inputMode} autoComplete="off" {...field} />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

interface CollectionFieldsProps {
  form: UseFormReturn<TerroirTuningFormData>
  /** What the API runs today, as last saved. */
  savedEffectiveMode: CollectionMode
}

const COLLECTION_PREFIX = 'admin.settings.terroirExport.collection'

/**
 * Who brings each shop's terroir order to eBio, and the consolidation point
 * the couriers drop it at. A courier needs the point's position: without it
 * the API falls back to eBio's own staff, and the warning says so.
 */
function CollectionFields({ form, savedEffectiveMode }: CollectionFieldsProps) {
  const { t } = useTranslation()
  const mode = form.watch('collectionMode')
  const latitude = form.watch('hubLatitude').trim()
  const longitude = form.watch('hubLongitude').trim()
  const hasPosition = latitude !== '' && longitude !== '' && isCoordinate(latitude, 90) && isCoordinate(longitude, 180)
  // While editing, mirror the API's rule; otherwise trust what it reported.
  const effectiveMode: CollectionMode = form.formState.isDirty
    ? (mode === 'COURIER' && !hasPosition ? 'EBIO' : mode)
    : savedEffectiveMode

  return (
    <fieldset className="space-y-4 rounded-md border p-4">
      <legend className="px-1 text-sm font-semibold">{t(`${COLLECTION_PREFIX}.title`)}</legend>
      <p className="text-muted-foreground text-sm">{t(`${COLLECTION_PREFIX}.hint`)}</p>

      <FormField
        control={form.control}
        name="collectionMode"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t(`${COLLECTION_PREFIX}.mode`)}</FormLabel>
            <FormControl>
              <div role="radiogroup" aria-label={t(`${COLLECTION_PREFIX}.mode`)} className="grid gap-3 sm:grid-cols-2">
                {COLLECTION_MODES.map(option => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={field.value === option}
                    onClick={() => field.onChange(option)}
                    className={cn(
                      'rounded-md border p-3 text-left transition-colors',
                      'focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]',
                      field.value === option
                        ? 'border-primary bg-primary/5'
                        : 'border-input hover:bg-accent',
                    )}
                  >
                    <span className="block text-sm font-medium">{t(`${COLLECTION_PREFIX}.mode${option}`)}</span>
                    <span className="text-muted-foreground block text-xs">{t(`${COLLECTION_PREFIX}.mode${option}Hint`)}</span>
                  </button>
                ))}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {mode !== effectiveMode && (
        <div
          role="note"
          className="border-ebio-earth-200 bg-ebio-earth-50 text-ebio-earth-800 dark:border-ebio-earth-800 dark:bg-ebio-earth-900 dark:text-ebio-earth-100 flex gap-3 rounded-md border p-3 text-sm"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{t(`${COLLECTION_PREFIX}.effectiveWarning`)}</p>
        </div>
      )}

      <div className="space-y-1">
        <h4 className="text-sm font-semibold">{t(`${COLLECTION_PREFIX}.hubTitle`)}</h4>
        <p className="text-muted-foreground text-sm">{t(`${COLLECTION_PREFIX}.hubHint`)}</p>
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <HubField form={form} name="hubName" label={t(`${COLLECTION_PREFIX}.hubName`)} placeholder={t(`${COLLECTION_PREFIX}.hubNamePlaceholder`)} />
        <HubField
          form={form}
          name="hubPhone"
          label={t(`${COLLECTION_PREFIX}.hubPhone`)}
          placeholder="+229 01 00 00 00 00"
          description={t(`${COLLECTION_PREFIX}.hubPhoneHint`)}
          inputMode="tel"
        />
        <HubField form={form} name="hubAddress" label={t(`${COLLECTION_PREFIX}.hubAddress`)} placeholder={t(`${COLLECTION_PREFIX}.hubAddressPlaceholder`)} />
        <HubField form={form} name="hubHours" label={t(`${COLLECTION_PREFIX}.hubHours`)} placeholder={t(`${COLLECTION_PREFIX}.hubHoursPlaceholder`)} />
        <HubField form={form} name="hubLatitude" label={t(`${COLLECTION_PREFIX}.latitude`)} placeholder="6.3703" inputMode="decimal" />
        <HubField form={form} name="hubLongitude" label={t(`${COLLECTION_PREFIX}.longitude`)} placeholder="2.3912" inputMode="decimal" />
      </div>
      <p className="text-muted-foreground text-sm">
        {t(`${COLLECTION_PREFIX}.positionHint`)}
        {' '}
        {hasPosition
          ? (
              <a
                className="text-primary inline-flex items-center gap-1 hover:underline"
                href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                {t(`${COLLECTION_PREFIX}.viewOnMap`)}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            )
          : t(`${COLLECTION_PREFIX}.noPosition`)}
      </p>
    </fieldset>
  )
}

/**
 * The tuning of the terroir export: packaging added to every parcel, how
 * long eBio needs to collect, the weight gap tolerated before a supplement,
 * the insurance price, the pickup reminder, the export criteria (banned
 * categories, minimum shelf life, maximum unit weight), then who collects
 * the shops' orders and where they are consolidated.
 */
export function TerroirExportForm({ values, categories, onSubmit, isPending, effectiveCollectionMode }: TerroirExportFormProps) {
  const { t } = useTranslation()
  const schema = useMemo(() => buildTerroirTuningSchema(t), [t])
  const form = useForm<TerroirTuningFormData>({
    resolver: zodResolver(schema) as Resolver<TerroirTuningFormData>,
    defaultValues: values,
  })

  // Keep the fields in sync when the query refetches.
  useEffect(() => {
    form.reset(values)
  }, [values, form])

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <NumberField form={form} name="packagingWeightG" min={0} max={5000} />
          <NumberField form={form} name="collectionDays" min={0} max={30} />
          <NumberField form={form} name="weightTolerancePct" min={0} max={100} />
          <NumberField form={form} name="pickupReminderDays" min={1} max={90} />
          <NumberField form={form} name="insuranceRatePct" min={0} max={50} step={0.01} />
          <NumberField form={form} name="insuranceMin" min={0} max={1000000} />
        </div>

        <fieldset className="space-y-3 rounded-md border p-4">
          <legend className="px-1 text-sm font-semibold">{t('admin.settings.terroirExport.criteriaTitle')}</legend>
          <p className="text-muted-foreground text-sm">{t('admin.settings.terroirExport.criteriaHint')}</p>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <NumberField form={form} name="minShelfLifeDays" min={1} max={3650} />
            <NumberField form={form} name="maxUnitWeightG" min={100} max={50000} />
          </div>

          <FormField
            control={form.control}
            name="bannedCategoryIds"
            render={({ field }) => {
              const selected = new Set(field.value)
              const toggle = (id: string, checked: boolean) => {
                const next = new Set(selected)
                if (checked)
                  next.add(id)
                else
                  next.delete(id)
                field.onChange([...next])
              }
              return (
                <FormItem>
                  <FormLabel>{t('admin.settings.terroirExport.fields.bannedCategoryIds')}</FormLabel>
                  <FormDescription>{t('admin.settings.terroirExport.fields.bannedCategoryIdsHint')}</FormDescription>
                  <div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
                    {categories.length === 0 && <p className="text-muted-foreground text-sm">{t('admin.settings.terroirExport.noCategories')}</p>}
                    {categories.map(category => (
                      <div key={category.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`terroir-banned-${category.id}`}
                          checked={selected.has(category.id)}
                          onCheckedChange={checked => toggle(category.id, checked === true)}
                        />
                        <Label htmlFor={`terroir-banned-${category.id}`} className="font-normal">{category.name}</Label>
                      </div>
                    ))}
                  </div>
                </FormItem>
              )
            }}
          />
        </fieldset>

        <CollectionFields form={form} savedEffectiveMode={effectiveCollectionMode} />

        <Button type="submit" disabled={isPending}>
          {t('common.save')}
        </Button>
      </form>
    </Form>
  )
}
